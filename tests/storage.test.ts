import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { LEVELS } from '../src/game/levels';
import { SAVE_VERSION, SaveStore, type KeyValueStore, type SessionSave } from '../src/game/storage';

const KEY = 'laboratorio-quimico.guardado';
const BAK = KEY + '.bak';
const SESSION = 'laboratorio-quimico.partida';

/** localStorage de mentira; `failOn` hace fallar la escritura de una clave. */
class FakeStorage implements KeyValueStore {
  map = new Map<string, string>();
  failOn: string | null = null;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (key === this.failOn) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const DT = 1 / 60;
function newGame(levelId: string): Game {
  const level = LEVELS.find((l) => l.id === levelId)!;
  return new Game(level, { toast: () => {}, changed: () => {}, won: () => {} });
}
function run(game: Game, seconds: number): void {
  for (let i = 0; i < seconds / DT; i++) game.update(DT);
}
function pour(game: Game, reagentId: string, ml: number): void {
  if (ml) game.setDose(ml);
  game.requestPour(game.level.reagents.indexOf(reagentId), 0, null);
  run(game, 3);
}

describe('guardado: progreso', () => {
  it('sin nada guardado empieza de cero', () => {
    const store = new SaveStore(new FakeStorage());
    expect(store.status).toBe('new');
    expect(store.totalStars()).toBe(0);
    expect(store.isUnlocked(0)).toBe(true);
    expect(store.isUnlocked(1)).toBe(false);
    expect(store.data.settings.sound).toBe(true);
  });

  it('guarda, cierra y vuelve a cargar', () => {
    const disk = new FakeStorage();
    const a = new SaveStore(disk);
    expect(a.recordWin('viraje', 2, 5)).toEqual({ improved: true, saved: true });
    a.setSetting('sound', false);

    const b = new SaveStore(disk);
    expect(b.status).toBe('ok');
    expect(b.stars('viraje')).toBe(2);
    expect(b.best('viraje')).toBe(5);
    expect(b.data.settings.sound).toBe(false);
    expect(b.data.last).toBe('viraje');
    expect(b.isUnlocked(1)).toBe(true);
    expect(JSON.parse(disk.getItem(KEY)!).version).toBe(SAVE_VERSION);
  });

  it('una victoria peor no baja las estrellas ni la mejor marca', () => {
    const store = new SaveStore(new FakeStorage());
    store.recordWin('viraje', 3, 2);
    expect(store.recordWin('viraje', 1, 9).improved).toBe(false);
    expect(store.stars('viraje')).toBe(3);
    expect(store.best('viraje')).toBe(2);
    // Mejor marca con las mismas estrellas sí cuenta
    store.recordWin('neutralizacion', 2, 6);
    expect(store.recordWin('neutralizacion', 2, 5).improved).toBe(true);
    expect(store.best('neutralizacion')).toBe(5);
  });

  it('migra el guardado de la primera versión (otra clave, sin número de versión)', () => {
    const disk = new FakeStorage();
    disk.setItem('laboratorio-quimico.v1', JSON.stringify({ stars: { viraje: 3, neutralizacion: 2 } }));
    disk.setItem('laboratorio-quimico.sonido', 'off');
    const store = new SaveStore(disk);
    expect(store.status).toBe('migrated');
    expect(store.stars('viraje')).toBe(3);
    expect(store.stars('neutralizacion')).toBe(2);
    expect(store.best('viraje')).toBe(0);
    expect(store.data.settings.sound).toBe(false);
    // Quedó escrito en el formato nuevo y las claves viejas se fueron
    expect(JSON.parse(disk.getItem(KEY)!).version).toBe(SAVE_VERSION);
    expect(disk.getItem('laboratorio-quimico.v1')).toBeNull();
    expect(new SaveStore(disk).status).toBe('ok');
  });

  it('si el principal está dañado usa la copia de respaldo', () => {
    const disk = new FakeStorage();
    const a = new SaveStore(disk);
    a.recordWin('viraje', 3, 2);
    a.recordWin('neutralizacion', 2, 6); // el guardado anterior pasa a .bak
    disk.setItem(KEY, '{"version":2,"levels":{"vir'); // truncado
    const b = new SaveStore(disk);
    expect(b.status).toBe('backup');
    expect(b.stars('viraje')).toBe(3);
    expect(b.stars('neutralizacion')).toBe(0);
    // El principal quedó reparado y la copia buena no se pisó con el dañado
    expect(new SaveStore(disk).status).toBe('ok');
    expect(JSON.parse(disk.getItem(BAK)!).levels.viraje.stars).toBe(3);
  });

  it('si no se puede leer nada, avisa y empieza de cero', () => {
    const disk = new FakeStorage();
    disk.setItem(KEY, 'esto no es JSON');
    disk.setItem(BAK, '[1,2,3]');
    const store = new SaveStore(disk);
    expect(store.status).toBe('corrupt');
    expect(store.totalStars()).toBe(0);
  });

  it('no pisa un guardado de una versión más nueva', () => {
    const disk = new FakeStorage();
    const future = JSON.stringify({ version: SAVE_VERSION + 1, levels: { viraje: { stars: 3, best: 2 } }, cosaNueva: 1 });
    disk.setItem(KEY, future);
    const store = new SaveStore(disk);
    expect(store.status).toBe('newer');
    expect(store.stars('viraje')).toBe(3);
    expect(store.recordWin('neutralizacion', 3, 3).saved).toBe(false);
    expect(store.saveSession({ level: 'viraje', actions: 1, dose: 10, vessels: [] })).toBe(false);
    expect(disk.getItem(KEY)).toBe(future);
  });

  it('descarta niveles que ya no existen y corrige valores fuera de rango', () => {
    const disk = new FakeStorage();
    disk.setItem(
      KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        levels: {
          viraje: { stars: 9, best: 2 },
          neutralizacion: { stars: 2, best: -4 },
          'nivel-borrado': { stars: 3, best: 1 },
          hidrogeno: 'roto',
          frio: { stars: 3.9, best: Number.NaN },
        },
        settings: { sound: 'sí', haptics: false },
        last: 'nivel-borrado',
      }),
    );
    const store = new SaveStore(disk);
    expect(store.status).toBe('ok');
    expect(store.stars('viraje')).toBe(0);
    expect(store.data.levels.neutralizacion).toEqual({ stars: 2, best: 0 });
    expect(store.data.levels['nivel-borrado']).toBeUndefined();
    expect(store.stars('hidrogeno')).toBe(0);
    expect(store.data.levels.frio).toEqual({ stars: 3, best: 0 });
    expect(store.data.settings).toEqual({ sound: true, haptics: false, calm: false });
    expect(store.data.last).toBeNull();
  });

  it('si no se puede escribir lo informa y no rompe lo que había', () => {
    const disk = new FakeStorage();
    const store = new SaveStore(disk);
    store.recordWin('viraje', 3, 2);
    const before = disk.getItem(KEY);
    disk.failOn = KEY + '.tmp';
    expect(store.recordWin('neutralizacion', 3, 4).saved).toBe(false);
    expect(disk.getItem(KEY)).toBe(before);
    // En memoria el avance sigue estando
    expect(store.stars('neutralizacion')).toBe(3);
  });

  it('sin almacenamiento disponible funciona en memoria', () => {
    const store = new SaveStore(null);
    expect(store.status).toBe('unavailable');
    expect(store.recordWin('viraje', 3, 2).saved).toBe(false);
    expect(store.stars('viraje')).toBe(3);
    expect(store.loadSession()).toBeNull();
  });

  it('borrar el progreso conserva los ajustes', () => {
    const disk = new FakeStorage();
    const store = new SaveStore(disk);
    store.recordWin('viraje', 3, 2);
    store.setSetting('calm', true);
    store.saveSession({ level: 'viraje', actions: 1, dose: 10, vessels: [] });
    store.clearProgress();
    const again = new SaveStore(disk);
    expect(again.totalStars()).toBe(0);
    expect(again.data.settings.calm).toBe(true);
    expect(disk.getItem(SESSION)).toBeNull();
  });
});

describe('guardado: partida en curso', () => {
  it('retoma un nivel a medio hacer y se puede terminar', () => {
    const disk = new FakeStorage();
    const store = new SaveStore(disk);
    const a = newGame('ciclo-del-cobre');
    expect(a.snapshot()).toBeNull(); // todavía no se hizo nada
    pour(a, 'hcl2', 10);
    run(a, 12);
    pour(a, 'zn', 0);
    run(a, 12);
    const snap = a.snapshot()!;
    expect(store.saveSession(snap)).toBe(true);

    // "Se cierra la pestaña": otro almacén y otra partida leen del mismo disco
    const session = new SaveStore(disk).loadSession()!;
    expect(session.level).toBe('ciclo-del-cobre');
    const b = newGame('ciclo-del-cobre');
    expect(b.restore(session)).toBe(true);
    expect(b.actions).toBe(2);
    expect(b.vessels[0].vol).toBeCloseTo(a.vessels[0].vol, 9);
    expect(b.vessels[0].n.CuS).toBeCloseTo(a.vessels[0].n.CuS, 12);
    expect(b.vessels[0].n.Cu).toBeCloseTo(a.vessels[0].n.Cu, 12);
    expect(b.vessels[0].temp).toBeCloseTo(a.vessels[0].temp, 9);

    pour(b, 'zn', 0);
    run(b, 15);
    pour(b, 'hcl2', 10);
    run(b, 40);
    expect(b.won).toBe(true);
    expect(b.actions).toBe(4);
  });

  it('no guarda con un vertido a medias', () => {
    const g = newGame('viraje');
    g.setDose(10);
    g.requestPour(1, 0, null);
    run(g, 0.6);
    expect(g.pour).not.toBeNull();
    expect(g.snapshot()).toBeNull();
    run(g, 3);
    expect(g.snapshot()).not.toBeNull();
  });

  it('el mechero no se guarda prendido', () => {
    const a = newGame('oxido-de-cobre');
    pour(a, 'cuso4', 10);
    a.toggleBurner();
    run(a, 2);
    const snap = { ...a.snapshot()!, version: SAVE_VERSION, savedAt: 0 } as SessionSave;
    const b = newGame('oxido-de-cobre');
    expect(b.restore(JSON.parse(JSON.stringify(snap)))).toBe(true);
    expect(b.vessels[0].heating).toBe(false);
    expect(b.vessels[0].temp).toBeGreaterThan(30);
  });

  it('rechaza una partida con datos imposibles y deja el nivel como nuevo', () => {
    const good = newGame('viraje');
    pour(good, 'naoh01', 5);
    const base = { ...good.snapshot()!, version: SAVE_VERSION, savedAt: 0 } as SessionSave;
    const broken: [string, (s: SessionSave) => void][] = [
      ['volumen mayor que la capacidad', (s) => (s.vessels[0].vol = 5000)],
      ['cantidad negativa', (s) => (s.vessels[0].n.Na = -1)],
      ['especie inexistente', (s) => (s.vessels[0].n.Unobtainium = 1)],
      ['temperatura no numérica', (s) => ((s.vessels[0] as unknown as Record<string, unknown>).temp = 'caliente')],
      ['otro nivel', (s) => (s.level = 'frio')],
      ['recipientes de más', (s) => s.vessels.push(s.vessels[0])],
      ['acciones inválidas', (s) => (s.actions = -3)],
    ];
    for (const [name, damage] of broken) {
      const s = JSON.parse(JSON.stringify(base)) as SessionSave;
      damage(s);
      const g = newGame('viraje');
      expect(g.restore(s), name).toBe(false);
      expect(g.actions, name).toBe(0);
      expect(g.vessels[0].vol, name).toBe(40);
      expect(g.vessels[0].n.Na ?? 0, name).toBe(0);
    }
  });

  it('una partida de otra versión o de un nivel que no existe se ignora', () => {
    const disk = new FakeStorage();
    const store = new SaveStore(disk);
    disk.setItem(SESSION, JSON.stringify({ version: 1, level: 'viraje', actions: 1, dose: 10, vessels: [] }));
    expect(store.loadSession()).toBeNull();
    disk.setItem(SESSION, JSON.stringify({ version: SAVE_VERSION, level: 'no-existe', actions: 1, dose: 10, vessels: [] }));
    expect(store.loadSession()).toBeNull();
    disk.setItem(SESSION, '{roto');
    expect(store.loadSession()).toBeNull();
  });

  it('en un nivel con patrón, el recipiente tapado no se toca al retomar', () => {
    const a = newGame('dilucion');
    pour(a, 'cuso4', 10);
    const snap = { ...a.snapshot()!, version: SAVE_VERSION, savedAt: 0 } as SessionSave;
    // Aunque el guardado traiga el patrón alterado, se usa el del nivel
    snap.vessels[1].n = { Cu: 0.5 };
    const b = newGame('dilucion');
    expect(b.restore(JSON.parse(JSON.stringify(snap)))).toBe(true);
    expect(b.vessels[1].n.Cu).toBeCloseTo(0.003, 5);
    expect(b.vessels[0].n.Cu).toBeCloseTo(0.005, 5);
  });
});
