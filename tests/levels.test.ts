import { describe, expect, it } from 'vitest';
import { MOLAR_GAS_ML, addReagent, createVessel, liquidLook, pH, solidGrams, step } from '../src/chem/engine';
import { REAGENTS } from '../src/chem/reagents';
import { Game } from '../src/game/game';
import { LEVELS } from '../src/game/levels';

const DT = 1 / 60;

function play(levelId: string) {
  const level = LEVELS.find((l) => l.id === levelId)!;
  const toasts: string[] = [];
  let stars = 0;
  const game = new Game(level, {
    toast: (t) => toasts.push(t),
    changed: () => {},
    won: (s) => (stars = s),
  });
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) game.update(DT);
  };
  const pour = (reagentId: string, ml: number, vessel = 0) => {
    const idx = level.reagents.indexOf(reagentId);
    if (idx < 0) throw new Error(`reactivo ${reagentId} no está en el nivel`);
    if (REAGENTS[reagentId].kind === 'liquid') game.setDose(ml);
    game.requestPour(idx, vessel, null);
    run(3);
  };
  return { game, level, toasts, run, pour, stars: () => stars };
}

describe('motor químico', () => {
  it('neutraliza ácido y base fuertes en cantidades equivalentes', () => {
    const v = createVessel('vaso', 100);
    addReagent(v, REAGENTS.hcl2, 20);
    step(v, DT);
    expect(pH(v)!).toBeCloseTo(-Math.log10(2), 2);
    addReagent(v, REAGENTS.naoh1, 40);
    step(v, DT);
    expect(pH(v)!).toBeCloseTo(7, 1);
    // 40 mmol × 55,8 kJ/mol repartidos en 60 mL: unos 8–9 °C de aumento
    expect(v.temp).toBeGreaterThan(32);
    expect(v.temp).toBeLessThan(35);
  });

  it('1 mL de base de más dispara el pH', () => {
    const v = createVessel('vaso', 100);
    addReagent(v, REAGENTS.hcl2, 20);
    addReagent(v, REAGENTS.naoh1, 41);
    step(v, DT);
    expect(pH(v)!).toBeGreaterThan(12);
  });

  it('precipita PbI₂ respetando el Kps', () => {
    const v = createVessel('vaso', 100);
    addReagent(v, REAGENTS.pbno3, 5);
    addReagent(v, REAGENTS.ki, 10);
    step(v, DT);
    expect(solidGrams(v, 'PbI2')).toBeGreaterThan(1.1);
    const L = v.vol / 1000;
    const q = (v.n.Pb / L) * (v.n.I / L) ** 2;
    expect(q / 9.8e-9).toBeCloseTo(1, 3);
  });

  it('el PbCl₂ se redisuelve al diluir', () => {
    const v = createVessel('vaso', 100);
    addReagent(v, REAGENTS.pbno3, 1);
    addReagent(v, REAGENTS.nacl, 1);
    step(v, DT);
    expect(solidGrams(v, 'PbCl2')).toBeGreaterThan(0.05);
    addReagent(v, REAGENTS.agua, 90);
    step(v, DT);
    expect(solidGrams(v, 'PbCl2')).toBe(0);
  });

  it('el yoduro desplaza al cloruro de la plata (AgCl → AgI)', () => {
    const v = createVessel('vaso', 100);
    addReagent(v, REAGENTS.agno3, 10);
    addReagent(v, REAGENTS.nacl, 1);
    for (let i = 0; i < 60; i++) step(v, DT);
    expect(solidGrams(v, 'AgCl')).toBeGreaterThan(0.1);
    addReagent(v, REAGENTS.ki, 5);
    for (let i = 0; i < 60 * 30; i++) step(v, DT);
    expect(solidGrams(v, 'AgCl')).toBeLessThan(0.001);
    expect(solidGrams(v, 'AgI')).toBeGreaterThan(0.2);
  });

  it('el ácido redisuelve el hidróxido de cobre', () => {
    const v = createVessel('vaso', 150);
    addReagent(v, REAGENTS.cuso4, 10);
    addReagent(v, REAGENTS.naoh1, 10);
    step(v, DT);
    expect(solidGrams(v, 'CuOH2')).toBeGreaterThan(0.45);
    expect(pH(v)!).toBeGreaterThan(6);
    expect(pH(v)!).toBeLessThan(9);
    addReagent(v, REAGENTS.hcl1, 11);
    step(v, DT);
    expect(solidGrams(v, 'CuOH2')).toBe(0);
    expect(v.n.Cu).toBeCloseTo(0.005, 6);
  });

  it('el cobre metálico no reacciona con HCl', () => {
    const v = createVessel('erlenmeyer', 250);
    addReagent(v, REAGENTS.hcl2, 25);
    addReagent(v, REAGENTS.cu, 1);
    for (let i = 0; i < 600; i++) step(v, DT);
    expect(v.gasOut.H2 ?? 0).toBe(0);
    expect(v.temp).toBeCloseTo(25, 1);
  });

  it('la fenolftaleína solo colorea en medio básico', () => {
    const v = createVessel('vaso', 100);
    addReagent(v, REAGENTS.agua, 40);
    addReagent(v, REAGENTS.fenol, 0.15);
    step(v, DT);
    const neutral = liquidLook(v).rgb;
    expect(neutral[1]).toBeGreaterThan(200);
    addReagent(v, REAGENTS.naoh01, 5);
    step(v, DT);
    const basic = liquidLook(v).rgb;
    expect(basic[0]).toBeGreaterThan(180);
    expect(basic[1]).toBeLessThan(60);
  });
});

describe('motor químico: sales, cristales y metales', () => {
  const settle = (v: ReturnType<typeof createVessel>, seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) step(v, DT);
  };

  it('el nitrato de amonio enfría al disolverse y el cloruro de calcio calienta', () => {
    const cold = createVessel('vaso', 100);
    addReagent(cold, REAGENTS.agua, 25);
    addReagent(cold, REAGENTS.nh4no3, 2);
    settle(cold, 4);
    expect(cold.n.NH4NO3_s).toBe(0);
    expect(cold.temp).toBeLessThan(4);
    expect(cold.temp).toBeGreaterThan(-3);

    const hot = createVessel('vaso', 100);
    addReagent(hot, REAGENTS.agua, 25);
    addReagent(hot, REAGENTS.cacl2, 1);
    settle(hot, 4);
    expect(hot.temp).toBeGreaterThan(48);
  });

  it('la sal de mesa satura cerca de 6,1 M y el resto queda sin disolver', () => {
    const v = createVessel('vaso', 100);
    addReagent(v, REAGENTS.agua, 25);
    addReagent(v, REAGENTS.sal, 2);
    settle(v, 8);
    expect(v.n.Na / 0.025).toBeCloseTo(6.13, 1);
    expect(solidGrams(v, 'NaCl_s')).toBeGreaterThan(0.8);
    // Con más agua termina de disolverse
    addReagent(v, REAGENTS.agua, 25);
    settle(v, 8);
    expect(solidGrams(v, 'NaCl_s')).toBe(0);
  });

  it('al evaporar una salmuera cristaliza la sal', () => {
    const v = createVessel('vaso', 30);
    addReagent(v, REAGENTS.hcl6, 5);
    addReagent(v, REAGENTS.naoh6, 5);
    settle(v, 1);
    expect(v.temp).toBeGreaterThan(45);
    expect(solidGrams(v, 'NaCl_s')).toBe(0);
    v.heating = true;
    for (let i = 0; i < 60 / DT && v.vol > 3; i++) step(v, DT);
    v.heating = false;
    settle(v, 3);
    expect(v.vol).toBeLessThan(3.1);
    expect(solidGrams(v, 'NaCl_s')).toBeGreaterThan(0.6);
    expect(pH(v)!).toBeCloseTo(7, 1);
  });

  it('el cobre desplaza a la plata en proporción 1 : 2 y la reacción termina', () => {
    const v = createVessel('vaso', 50);
    addReagent(v, REAGENTS.agno3_05, 20);
    addReagent(v, REAGENTS.cu5, 1);
    settle(v, 25);
    expect(v.n.CuM).toBe(0);
    expect(v.n.Ag).toBeLessThan(1e-9);
    expect(v.n.AgM).toBeCloseTo(0.01, 6);
    expect(v.n.Cu).toBeCloseTo(0.005, 6);
    // El líquido quedó celeste por el Cu²⁺
    const rgb = liquidLook(v).rgb;
    expect(rgb[2] - rgb[0]).toBeGreaterThan(60);
  });

  it('el ácido disuelve el zinc sobrante pero no toca al cobre depositado', () => {
    const v = createVessel('vaso', 50);
    addReagent(v, REAGENTS.cuso4, 10);
    addReagent(v, REAGENTS.zn, 1);
    settle(v, 20);
    expect(v.n.Cu).toBeLessThan(1e-9);
    expect(v.n.CuS).toBeCloseTo(0.005, 6);
    expect(v.n.Zn).toBeGreaterThan(0.002);
    addReagent(v, REAGENTS.hcl2, 10);
    settle(v, 30);
    expect(v.n.Zn).toBe(0);
    expect(v.n.CuS).toBeCloseTo(0.005, 6);
    expect(v.gasOut.H2).toBeGreaterThan(0.002);
  });

  it('el óxido de cobre no se revierte solo en una solución de cobre', () => {
    const v = createVessel('vaso', 50);
    addReagent(v, REAGENTS.cuo, 1);
    addReagent(v, REAGENTS.cuso4, 10);
    settle(v, 60);
    expect(v.n.CuO).toBeGreaterThan(0.00999);
    expect(v.n.CuOH2 ?? 0).toBeLessThan(1e-5);
  });
});

describe('niveles: la solución prevista funciona', () => {
  it('1 · Primer viraje', () => {
    const t = play('viraje');
    t.pour('fenol', 0);
    expect(t.stars()).toBe(0);
    t.pour('naoh01', 5);
    expect(t.game.won).toBe(true);
    expect(t.stars()).toBe(3);
  });

  it('2 · Neutralización exacta', () => {
    const t = play('neutralizacion');
    t.pour('naoh1', 25);
    t.pour('naoh1', 10);
    expect(t.game.won).toBe(false);
    t.pour('naoh1', 5);
    expect(t.game.won).toBe(true);
    expect(t.stars()).toBe(3);
  });

  it('2 · pasarse de base se corrige con ácido', () => {
    const t = play('neutralizacion');
    t.pour('naoh1', 25);
    t.pour('naoh1', 25);
    expect(t.game.won).toBe(false);
    t.pour('hcl2', 5);
    expect(t.game.won).toBe(true);
  });

  it('2 · vaciar y poner agua no cuenta', () => {
    const t = play('neutralizacion');
    t.game.emptySelected();
    t.pour('agua', 25);
    expect(t.game.won).toBe(false);
  });

  it('3 · Lluvia de oro', () => {
    const t = play('lluvia-de-oro');
    t.pour('pbno3', 5);
    t.pour('ki', 10);
    expect(t.game.won).toBe(true);
    expect(t.stars()).toBe(3);
    expect(t.toasts.some((x) => x.includes('PbI₂'))).toBe(true);
  });

  it('3 · un sólido extra arruina la pureza', () => {
    const t = play('lluvia-de-oro');
    t.pour('pbno3', 5);
    t.pour('ki', 10);
    // ya ganó; en otra partida, con plata de por medio no debe ganar
    const u = play('lluvia-de-oro');
    u.pour('agno3', 5);
    u.pour('pbno3', 5);
    u.pour('ki', 10);
    expect(u.game.won).toBe(false);
  });

  it('4 · Hidrógeno bajo control (zinc diluido)', () => {
    const t = play('hidrogeno');
    t.pour('agua', 25);
    t.pour('hcl2', 10);
    t.pour('zn', 0);
    t.run(40);
    const v = t.game.vessels[0];
    expect((v.gasOut.H2 ?? 0) * MOLAR_GAS_ML).toBeGreaterThan(150);
    expect(v.maxTemp).toBeLessThan(40);
    expect(t.game.won).toBe(true);
    expect(t.stars()).toBe(3);
  });

  it('4 · sin diluir se pasa de temperatura', () => {
    const t = play('hidrogeno');
    t.pour('hcl2', 10);
    t.pour('zn', 0);
    t.run(40);
    expect(t.game.vessels[0].maxTemp).toBeGreaterThan(40);
    expect(t.game.won).toBe(false);
  });

  it('4 · también sale con magnesio bien diluido', () => {
    const t = play('hidrogeno');
    t.pour('agua', 25);
    t.pour('agua', 25);
    t.pour('agua', 25);
    t.pour('hcl2', 10);
    t.pour('mg', 0);
    t.pour('mg', 0);
    t.run(20);
    expect(t.game.won).toBe(true);
  });

  it('5 · Del celeste al negro', () => {
    const t = play('oxido-de-cobre');
    t.pour('cuso4', 10);
    t.pour('naoh1', 10);
    expect(solidGrams(t.game.vessels[0], 'CuOH2')).toBeGreaterThan(0.45);
    expect(t.game.won).toBe(false);
    t.game.toggleBurner();
    t.run(25);
    expect(t.game.won).toBe(true);
    expect(solidGrams(t.game.vessels[0], 'CuO')).toBeGreaterThan(0.35);
    expect(t.stars()).toBe(3);
  });

  it('6 · Dilución a medida', () => {
    const t = play('dilucion');
    t.pour('cuso4', 10);
    t.pour('cuso4', 10);
    t.pour('agua', 25);
    expect(t.game.won).toBe(false);
    t.pour('agua', 5);
    expect(t.game.won).toBe(true);
    expect(t.stars()).toBe(3);
  });

  it('6 · el patrón no se puede tocar y una dilución equivocada no gana', () => {
    const t = play('dilucion');
    const before = t.game.vessels[1].vol;
    t.pour('agua', 5, 1);
    expect(t.game.vessels[1].vol).toBe(before);
    expect(t.game.actions).toBe(0);
    t.pour('cuso4', 10);
    t.pour('agua', 25);
    t.pour('agua', 25);
    expect(t.game.won).toBe(false);
  });

  it('7 · Frío instantáneo', () => {
    const t = play('frio');
    t.pour('agua', 25);
    t.pour('nh4no3', 0);
    expect(t.game.won).toBe(false);
    t.pour('nh4no3', 0);
    expect(t.game.won).toBe(true);
    expect(t.stars()).toBe(3);
  });

  it('7 · las otras sales no enfrían lo suficiente', () => {
    const t = play('frio');
    t.pour('agua', 25);
    t.pour('sal', 0);
    t.pour('sal', 0);
    t.pour('cacl2', 0);
    t.run(10);
    expect(t.game.won).toBe(false);
  });

  it('8 · Árbol de plata', () => {
    const t = play('arbol-de-plata');
    t.pour('cu5', 0);
    t.pour('agno3_05', 10);
    t.pour('agno3_05', 10);
    t.run(30);
    expect(t.game.won).toBe(true);
    expect(t.stars()).toBe(3);
    expect(t.toasts.some((x) => x.includes('plata metálica'))).toBe(true);
  });

  it('8 · con nitrato de plata de más no gana', () => {
    const t = play('arbol-de-plata');
    t.pour('cu5', 0);
    t.pour('agno3_05', 25);
    t.run(40);
    expect(t.game.won).toBe(false);
    expect(t.game.vessels[0].n.CuM).toBe(0);
  });

  it('9 · Sal de laboratorio', () => {
    const t = play('sal');
    t.pour('hcl6', 5);
    t.pour('naoh6', 5);
    expect(t.game.won).toBe(false);
    t.game.toggleBurner();
    t.run(45);
    expect(t.game.won).toBe(true);
    expect(t.stars()).toBe(3);
  });

  it('10 · El ciclo del cobre', () => {
    const t = play('ciclo-del-cobre');
    t.pour('hcl2', 10);
    t.run(15);
    const v = t.game.vessels[0];
    expect(v.n.CuO).toBe(0);
    expect(v.n.Cu).toBeCloseTo(0.01, 6);
    t.pour('zn', 0);
    t.run(15);
    // Una cucharada (7,6 mmol) no alcanza para 10 mmol de cobre
    expect(v.n.Cu).toBeGreaterThan(0.002);
    t.pour('zn', 0);
    t.run(15);
    expect(v.n.Cu).toBeLessThan(1e-9);
    expect(t.game.won).toBe(false);
    t.pour('hcl2', 10);
    t.run(40);
    expect(t.game.won).toBe(true);
    expect(v.n.CuS).toBeCloseTo(0.01, 6);
    expect(t.stars()).toBe(3);
  });

  it('10 · apurarse gasta zinc en el ácido, pero se puede arreglar', () => {
    const t = play('ciclo-del-cobre');
    // Zinc antes de que el óxido termine de disolverse: el ácido se lo come
    t.pour('hcl2', 10);
    t.pour('zn', 0);
    t.pour('zn', 0);
    t.run(10);
    t.pour('hcl2', 10);
    t.run(40);
    const v = t.game.vessels[0];
    expect(v.gasOut.H2).toBeGreaterThan(0.001);
    expect(v.n.CuO).toBe(0);
    expect(v.n.Zn).toBe(0);
    expect(v.n.Cu).toBeGreaterThan(1e-5);
    expect(t.game.won).toBe(false);
    // Más zinc para el cobre que quedó disuelto y ácido para el zinc sobrante
    t.pour('zn', 0);
    t.run(20);
    t.pour('hcl2', 10);
    t.run(40);
    expect(t.game.won).toBe(true);
    // Seis acciones contra cuatro de la receta ideal: dos estrellas
    expect(t.stars()).toBe(2);
  });

  it('10 · también sale con magnesio', () => {
    const t = play('ciclo-del-cobre');
    t.pour('hcl2', 10);
    t.run(15);
    t.pour('mg', 0);
    t.pour('mg', 0);
    t.pour('mg', 0);
    t.run(15);
    expect(t.game.won).toBe(false);
    t.pour('hcl2', 5);
    t.run(30);
    expect(t.game.won).toBe(true);
  });

  it('10 · sin ácido el zinc no hace nada con el óxido', () => {
    const t = play('ciclo-del-cobre');
    t.pour('agua', 10);
    t.pour('zn', 0);
    t.run(30);
    expect(t.game.vessels[0].n.CuO).toBeCloseTo(0.01, 9);
    expect(t.game.won).toBe(false);
  });

  it('5 · con base de más el pH queda alto y no gana', () => {
    const t = play('oxido-de-cobre');
    t.pour('cuso4', 10);
    t.pour('naoh1', 25);
    t.game.toggleBurner();
    t.run(25);
    expect(t.game.won).toBe(false);
  });
});
