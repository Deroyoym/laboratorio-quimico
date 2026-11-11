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

  it('5 · con base de más el pH queda alto y no gana', () => {
    const t = play('oxido-de-cobre');
    t.pour('cuso4', 10);
    t.pour('naoh1', 25);
    t.game.toggleBurner();
    t.run(25);
    expect(t.game.won).toBe(false);
  });
});
