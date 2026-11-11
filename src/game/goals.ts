import { MOLAR_GAS_ML, conc, pH, solidGrams, type Vessel } from '../chem/engine';
import { SOLIDS } from '../chem/species';

/** Condiciones que debe cumplir un mismo recipiente para superar el nivel. */
export type Cond =
  | { kind: 'has'; sp: string; min: number; label: string }
  | { kind: 'ph'; min: number; max: number; label: string }
  | { kind: 'salt'; cat: string; an: string; M: number; grams: number; label: string }
  | { kind: 'solidMin'; sp: string; grams: number; label: string }
  | { kind: 'onlySolid'; sp: string; label: string }
  | { kind: 'noSolid'; sp: string; label: string }
  | { kind: 'aqMax'; sp: string; conc: number; label: string }
  | { kind: 'gasMin'; sp: string; ml: number; label: string }
  | { kind: 'tempNever'; max: number; label: string }
  | { kind: 'tempMax'; max: number; label: string }
  | { kind: 'concRange'; sp: string; min: number; max: number; label: string }
  | { kind: 'volMin'; min: number; label: string };

export interface CondResult {
  ok: boolean;
  label: string;
  /** Valor actual, para mostrar el progreso */
  value?: string;
  /** La condición se rompió y ya no se puede recuperar sin vaciar */
  broken?: boolean;
}

/** Número con coma decimal. */
export function fmt(x: number, digits = 1): string {
  return x.toFixed(digits).replace('.', ',');
}

/** Cantidad mínima de sólido que cuenta como "hay sólido" (mol) */
const TRACE = 1e-5;

export function evalCond(c: Cond, v: Vessel, showPh: boolean): CondResult {
  const wet = v.vol > 0.5;
  switch (c.kind) {
    case 'has':
      return { ok: (v.n[c.sp] ?? 0) >= c.min, label: c.label };
    case 'ph': {
      const p = pH(v);
      return {
        ok: wet && p !== null && p >= c.min && p <= c.max,
        label: c.label,
        value: showPh && wet && p !== null ? `pH ${fmt(p)}` : undefined,
      };
    }
    case 'salt': {
      const g = Math.min(v.n[c.cat] ?? 0, v.n[c.an] ?? 0) * c.M;
      return { ok: g >= c.grams - 1e-6, label: c.label, value: `${fmt(g)} g` };
    }
    case 'solidMin': {
      const g = solidGrams(v, c.sp);
      return { ok: g >= c.grams, label: c.label, value: `${fmt(g, 2)} g` };
    }
    case 'onlySolid': {
      const others = SOLIDS.some((s) => s.id !== c.sp && (v.n[s.id] ?? 0) > TRACE);
      return { ok: (v.n[c.sp] ?? 0) > TRACE && !others, label: c.label };
    }
    case 'noSolid':
      return { ok: wet && (v.n[c.sp] ?? 0) <= TRACE, label: c.label };
    case 'aqMax':
      return { ok: wet && conc(v, c.sp) <= c.conc, label: c.label };
    case 'gasMin': {
      const ml = (v.gasOut[c.sp] ?? 0) * MOLAR_GAS_ML;
      return { ok: ml >= c.ml, label: c.label, value: `${Math.floor(ml)} mL` };
    }
    case 'tempMax':
      return { ok: wet && v.temp <= c.max, label: c.label, value: wet ? `${fmt(v.temp)} °C` : undefined };
    case 'concRange': {
      const x = conc(v, c.sp);
      const ok = wet && x >= c.min && x <= c.max;
      // Se compara a ojo con el patrón: no se muestra el número
      const value = !wet ? undefined : x < c.min ? 'más claro' : x > c.max ? 'más oscuro' : 'igual';
      return { ok, label: c.label, value };
    }
    case 'volMin':
      return { ok: v.vol >= c.min - 1e-6, label: c.label, value: `${fmt(v.vol, 0)} mL` };
    case 'tempNever': {
      const broken = v.maxTemp > c.max;
      return { ok: !broken, label: c.label, value: `máx. ${fmt(v.maxTemp)} °C`, broken };
    }
  }
}

export function evalAll(conds: Cond[], v: Vessel, showPh: boolean): CondResult[] {
  return conds.map((c) => evalCond(c, v, showPh));
}
