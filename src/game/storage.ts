/**
 * Guardado del juego.
 *
 * Hay dos archivos (claves de localStorage) separados:
 *  - el **progreso**: estrellas, mejor marca de cada nivel y ajustes. Se
 *    escribe en momentos seguros (al ganar, al cambiar un ajuste);
 *  - la **partida en curso**: el contenido de los recipientes del nivel que se
 *    está jugando, para retomarlo si el navegador cierra la pestaña. Es un
 *    autoguardado y nunca pisa al progreso.
 *
 * Reglas que sigue:
 *  - Todo guardado lleva `version`. Al leer uno viejo se le aplican las
 *    migraciones en orden hasta la versión actual.
 *  - Antes de pisar el progreso se copia el anterior a `.bak`; si el principal
 *    no se puede leer, se usa la copia.
 *  - Lo que se lee se valida: ids de niveles que ya no existen se descartan y
 *    los números fuera de rango se corrigen.
 *  - Si no se puede escribir, se avisa: `save()` devuelve false.
 */
import type { VesselData } from '../chem/engine';
import { LEVELS } from './levels';

export const SAVE_VERSION = 2;

const KEY = 'laboratorio-quimico.guardado';
const BAK = KEY + '.bak';
const TMP = KEY + '.tmp';
const SESSION_KEY = 'laboratorio-quimico.partida';
/** Claves de la primera versión publicada (sin campo `version`) */
const LEGACY_KEY = 'laboratorio-quimico.v1';
const LEGACY_SOUND = 'laboratorio-quimico.sonido';

export interface LevelRecord {
  /** Mejor cantidad de estrellas (1–3) */
  stars: number;
  /** Menor cantidad de acciones con la que se ganó; 0 si no se registró */
  best: number;
}

export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** Menos animación: sin vaivenes ni transiciones */
  calm: boolean;
}

export interface SaveData {
  version: number;
  levels: Record<string, LevelRecord>;
  settings: Settings;
  /** Último nivel jugado */
  last: string | null;
  savedAt: number;
}

export interface SessionSave {
  version: number;
  level: string;
  actions: number;
  dose: number;
  vessels: VesselData[];
  savedAt: number;
}

/** Lo mínimo que hace falta de `localStorage` (permite probar con uno falso) */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadStatus =
  /** No había nada guardado */
  | 'new'
  | 'ok'
  /** Se convirtió un guardado de una versión anterior */
  | 'migrated'
  /** El principal estaba dañado y se usó la copia de respaldo */
  | 'backup'
  /** Ni el principal ni la copia se pudieron leer: se empieza de cero */
  | 'corrupt'
  /** El guardado es de una versión más nueva del juego: no se pisa */
  | 'newer'
  /** El navegador no deja usar almacenamiento */
  | 'unavailable';

const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true, calm: false };

function blank(): SaveData {
  return { version: SAVE_VERSION, levels: {}, settings: { ...DEFAULT_SETTINGS }, last: null, savedAt: 0 };
}

type Raw = Record<string, unknown>;
const isObject = (x: unknown): x is Raw => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Migraciones: cada una lleva los datos de una versión a la siguiente. */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  // v1 guardaba solo { stars: { nivel: n } }
  1: (d) => {
    const stars = isObject(d.stars) ? d.stars : {};
    const levels: Record<string, LevelRecord> = {};
    for (const [id, s] of Object.entries(stars)) levels[id] = { stars: Number(s), best: 0 };
    return { levels, settings: isObject(d.settings) ? d.settings : {}, last: null, savedAt: 0 };
  },
};

/** Lleva datos crudos a la forma actual, descartando lo que no sirve. */
function sanitize(d: Raw): SaveData {
  const out = blank();
  const known = new Set(LEVELS.map((l) => l.id));
  if (isObject(d.levels)) {
    for (const [id, rec] of Object.entries(d.levels)) {
      if (!known.has(id) || !isObject(rec)) continue;
      const stars = Math.floor(Number(rec.stars));
      if (!(stars >= 1 && stars <= 3)) continue;
      const best = Math.floor(Number(rec.best));
      out.levels[id] = { stars, best: Number.isFinite(best) && best > 0 ? best : 0 };
    }
  }
  if (isObject(d.settings)) {
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (typeof d.settings[k] === 'boolean') out.settings[k] = d.settings[k] as boolean;
    }
  }
  if (typeof d.last === 'string' && known.has(d.last)) out.last = d.last;
  const at = Number(d.savedAt);
  if (Number.isFinite(at) && at > 0) out.savedAt = at;
  return out;
}

class NewerSave extends Error {}

/** Interpreta un texto guardado: versión → migraciones → validación. */
function parse(raw: string): SaveData {
  const d: unknown = JSON.parse(raw);
  if (!isObject(d)) throw new Error('el guardado no es un objeto');
  // Sin campo de versión = la primera versión publicada
  let v = d.version === undefined ? 1 : Math.floor(Number(d.version));
  if (!Number.isFinite(v) || v < 1) throw new Error('versión inválida');
  if (v > SAVE_VERSION) throw new NewerSave();
  let data = d;
  while (v < SAVE_VERSION) {
    data = MIGRATIONS[v](data);
    v++;
  }
  return sanitize(data);
}

export class SaveStore {
  data: SaveData = blank();
  status: LoadStatus = 'new';
  private backend: KeyValueStore | null;
  /** Con un guardado de versión más nueva no se escribe nada */
  private readOnly = false;

  constructor(backend: KeyValueStore | null) {
    this.backend = backend;
    this.load();
  }

  private read(key: string): string | null {
    try {
      return this.backend ? this.backend.getItem(key) : null;
    } catch {
      return null;
    }
  }

  private load(): void {
    if (!this.backend) {
      this.status = 'unavailable';
      return;
    }
    let sawData = false;
    for (const [key, status] of [
      [KEY, 'ok'],
      [BAK, 'backup'],
      [TMP, 'backup'],
    ] as [string, LoadStatus][]) {
      const raw = this.read(key);
      if (raw === null) continue;
      sawData = true;
      try {
        this.data = parse(raw);
        this.status = status;
        // Se repone el principal sin rotar: la copia buena no se pisa con el dañado
        if (status === 'backup') this.save(false);
        return;
      } catch (e) {
        if (e instanceof NewerSave) {
          // Se muestra lo que se entienda, pero sin tocar el archivo
          this.status = 'newer';
          this.readOnly = true;
          try {
            this.data = sanitize(JSON.parse(raw) as Raw);
          } catch {
            this.data = blank();
          }
          return;
        }
      }
    }
    if (sawData) {
      this.status = 'corrupt';
      return;
    }

    // Guardado de la primera versión, en otra clave y sin número de versión
    const legacy = this.read(LEGACY_KEY);
    const legacySound = this.read(LEGACY_SOUND);
    if (legacy !== null || legacySound !== null) {
      try {
        this.data = legacy !== null ? parse(legacy) : blank();
      } catch {
        this.data = blank();
      }
      if (legacySound === 'off') this.data.settings.sound = false;
      this.status = 'migrated';
      if (this.save()) {
        try {
          this.backend.removeItem(LEGACY_KEY);
          this.backend.removeItem(LEGACY_SOUND);
        } catch {
          // quedan las claves viejas: no molestan
        }
      }
    }
  }

  /**
   * Escribe el progreso. Primero a una clave temporal, que se vuelve a leer
   * para comprobarla; después se respalda el guardado anterior y recién
   * entonces se reemplaza. Devuelve false si no se pudo guardar.
   */
  save(rotate = true): boolean {
    if (!this.backend || this.readOnly) return false;
    this.data.version = SAVE_VERSION;
    this.data.savedAt = Date.now();
    const json = JSON.stringify(this.data);
    try {
      this.backend.setItem(TMP, json);
      if (this.backend.getItem(TMP) !== json) return false;
      const previous = rotate ? this.backend.getItem(KEY) : null;
      if (previous !== null) this.backend.setItem(BAK, previous);
      this.backend.setItem(KEY, json);
      this.backend.removeItem(TMP);
      return true;
    } catch {
      return false;
    }
  }

  // --- Progreso ---------------------------------------------------------------

  stars(levelId: string): number {
    return this.data.levels[levelId]?.stars ?? 0;
  }

  best(levelId: string): number {
    return this.data.levels[levelId]?.best ?? 0;
  }

  totalStars(): number {
    return Object.values(this.data.levels).reduce((sum, r) => sum + r.stars, 0);
  }

  isUnlocked(index: number): boolean {
    return index === 0 || this.stars(LEVELS[index - 1].id) > 0;
  }

  /** Primer nivel desbloqueado que todavía no se ganó (o el último). */
  nextLevel(): number {
    const i = LEVELS.findIndex((l) => this.stars(l.id) === 0);
    return i < 0 ? LEVELS.length - 1 : i;
  }

  /** Anota una victoria; guarda solo si mejora algo. Devuelve si se pudo guardar. */
  recordWin(levelId: string, stars: number, actions: number): { improved: boolean; saved: boolean } {
    const prev = this.data.levels[levelId];
    const next: LevelRecord = {
      stars: Math.max(prev?.stars ?? 0, stars),
      best: prev && prev.best > 0 ? Math.min(prev.best, actions) : actions,
    };
    const improved = !prev || next.stars !== prev.stars || next.best !== prev.best;
    this.data.levels[levelId] = next;
    this.data.last = levelId;
    return { improved, saved: this.save() };
  }

  setLast(levelId: string): void {
    if (this.data.last === levelId) return;
    this.data.last = levelId;
    this.save();
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): boolean {
    this.data.settings[key] = value;
    return this.save();
  }

  /** Borra estrellas y partida en curso; los ajustes se conservan. */
  clearProgress(): boolean {
    this.data.levels = {};
    this.data.last = null;
    this.clearSession();
    return this.save();
  }

  // --- Partida en curso (autoguardado) ---------------------------------------

  saveSession(session: Omit<SessionSave, 'version' | 'savedAt'>): boolean {
    if (!this.backend || this.readOnly) return false;
    try {
      const full: SessionSave = { ...session, version: SAVE_VERSION, savedAt: Date.now() };
      this.backend.setItem(SESSION_KEY, JSON.stringify(full));
      return true;
    } catch {
      return false;
    }
  }

  /** La partida guardada, si es de esta versión y de un nivel que existe. */
  loadSession(): SessionSave | null {
    const raw = this.read(SESSION_KEY);
    if (raw === null) return null;
    try {
      const d: unknown = JSON.parse(raw);
      if (!isObject(d) || d.version !== SAVE_VERSION) return null;
      if (typeof d.level !== 'string' || !LEVELS.some((l) => l.id === d.level)) return null;
      if (!Array.isArray(d.vessels)) return null;
      return d as unknown as SessionSave;
    } catch {
      return null;
    }
  }

  clearSession(): void {
    try {
      this.backend?.removeItem(SESSION_KEY);
    } catch {
      // nada que borrar
    }
  }
}

/** `localStorage` si el navegador lo permite (en modo privado puede fallar). */
export function browserStorage(): KeyValueStore | null {
  try {
    const probe = 'laboratorio-quimico.prueba';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
