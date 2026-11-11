/**
 * Motor químico: cada recipiente guarda moles de cada especie, volumen y
 * temperatura. En cada paso de simulación:
 *
 *  1. Neutralización instantánea H⁺ + OH⁻ → H₂O (exotérmica).
 *  2. Equilibrios de precipitación por Kps (se forma o se redisuelve sólido).
 *  3. Reacciones cinéticas (metal + ácido, descomposición térmica…).
 *  4. Balance térmico: mechero, enfriamiento hacia el ambiente, ebullición.
 *
 * Los datos (Kps, ΔH, masas molares) son reales; lo único "de juego" es la
 * escala de tiempo, comprimida para que las reacciones se vean en segundos.
 */
import { COLORED, POWDERS, SPECIES, type RGB } from './species';
import type { ReagentDef } from './reagents';

export const AMBIENT = 25;
const KW = 1e-14;
/** Capacidad calorífica de las soluciones acuosas, J/(mL·K) */
const CP = 4.18;
/** Capacidad calorífica aproximada del vidrio del recipiente, J/K */
const GLASS_C = 20;
/** Volumen molar de un gas a 25 °C y 1 atm, mL/mol */
export const MOLAR_GAS_ML = 24465;
/** Potencia efectiva del mechero (W), comprimida en el tiempo */
const BURNER_W = 800;
/** Calor de vaporización del agua, J/mL */
const VAP_J_PER_ML = 2260;
/** Constante de enfriamiento de Newton, 1/s */
const COOLING = 0.02;
/** Tiempo característico de sedimentación de un precipitado, s */
const SETTLE_TAU = 5;

export type VesselKind = 'vaso' | 'erlenmeyer' | 'tubo';

export const VESSEL_NAMES: Record<VesselKind, string> = {
  vaso: 'Vaso de precipitados',
  erlenmeyer: 'Erlenmeyer',
  tubo: 'Tubo de ensayo',
};

export interface Vessel {
  kind: VesselKind;
  /** Capacidad en mL */
  capacity: number;
  /** Volumen de líquido en mL */
  vol: number;
  /** Temperatura en °C */
  temp: number;
  /** Moles de cada especie (disueltas y sólidas) */
  n: Record<string, number>;
  /** Moles de cada precipitado que todavía están en suspensión */
  susp: Record<string, number>;
  /** Moles de gas desprendidos desde que se llenó */
  gasOut: Record<string, number>;
  /** Velocidad de desprendimiento de gas suavizada (mol/s), para la animación */
  gasRate: number;
  maxTemp: number;
  heating: boolean;
  boiling: boolean;
  /** Fenómenos ya anunciados (para no repetir avisos) */
  seen: Set<string>;
}

export type LabEvent =
  | { kind: 'solid'; sp: string }
  | { kind: 'gas'; sp: string }
  | { kind: 'overflow' }
  | { kind: 'boil' };

export function createVessel(kind: VesselKind, capacity: number): Vessel {
  return {
    kind,
    capacity,
    vol: 0,
    temp: AMBIENT,
    n: {},
    susp: {},
    gasOut: {},
    gasRate: 0,
    maxTemp: AMBIENT,
    heating: false,
    boiling: false,
    seen: new Set(),
  };
}

export function emptyVessel(v: Vessel): void {
  v.vol = 0;
  v.temp = AMBIENT;
  v.n = {};
  v.susp = {};
  v.gasOut = {};
  v.gasRate = 0;
  v.maxTemp = AMBIENT;
  v.heating = false;
  v.boiling = false;
  v.seen.clear();
}

const mol = (v: Vessel, sp: string): number => v.n[sp] ?? 0;

/** [OH⁻] efectiva a partir de la base neta (mol/L), incluyendo la autoionización del agua. */
function ohFromNet(netBase: number): number {
  const root = Math.sqrt(netBase * netBase + 4 * KW);
  return netBase >= 0 ? (netBase + root) / 2 : (2 * KW) / (-netBase + root);
}

/** Concentración de H⁺ en mol/L (0 si no hay líquido). */
export function hConc(v: Vessel): number {
  if (v.vol <= 1e-9) return 0;
  const L = v.vol / 1000;
  return ohFromNet((mol(v, 'H') - mol(v, 'OH')) / L);
}

export function pH(v: Vessel): number | null {
  if (v.vol <= 1e-9) return null;
  return -Math.log10(hConc(v));
}

/** Concentración molar de una especie disuelta. */
export function conc(v: Vessel, sp: string): number {
  if (v.vol <= 1e-9) return 0;
  return mol(v, sp) / (v.vol / 1000);
}

export function solidGrams(v: Vessel, sp: string): number {
  return mol(v, sp) * (SPECIES[sp].M ?? 0);
}

function heatCapacity(v: Vessel): number {
  return v.vol * CP + GLASS_C;
}

/** Libera (q > 0) o absorbe (q < 0) calor en el recipiente. */
function addHeat(v: Vessel, joules: number): void {
  v.temp += joules / heatCapacity(v);
}

/**
 * Agrega reactivo. `amount` son mL (líquidos y goteros) o dosis (sólidos).
 * Devuelve cuánto entró realmente; si es menos que lo pedido, se rebalsó.
 */
export function addReagent(v: Vessel, r: ReagentDef, amount: number, events?: LabEvent[]): number {
  if (amount <= 0) return 0;
  if (r.kind === 'solid') {
    for (const [sp, perDose] of Object.entries(r.contents)) v.n[sp] = mol(v, sp) + perDose * amount;
    return amount;
  }
  const room = Math.max(0, v.capacity - v.vol);
  const dv = Math.min(amount, room);
  if (dv > 0) {
    // Mezcla térmica con el líquido que entra a temperatura ambiente
    const c0 = heatCapacity(v);
    v.temp = (v.temp * c0 + AMBIENT * dv * CP) / (c0 + dv * CP);
    // El chorro remueve parte del sedimento
    const stir = Math.min(0.5, (2 * dv) / (v.vol + dv));
    for (const s of POWDERS) {
      const total = mol(v, s.id);
      if (total > 0) {
        const cur = v.susp[s.id] ?? 0;
        v.susp[s.id] = cur + (total - cur) * stir;
      }
    }
    v.vol += dv;
    for (const [sp, perMl] of Object.entries(r.contents)) v.n[sp] = mol(v, sp) + perMl * dv;
  }
  if (dv < amount - 1e-9) events?.push({ kind: 'overflow' });
  return dv;
}

// --- Reacciones --------------------------------------------------------------

/** H⁺ + OH⁻ → H₂O, ΔH = −55,8 kJ/mol */
function neutralize(v: Vessel): void {
  const h = mol(v, 'H');
  const oh = mol(v, 'OH');
  const x = Math.min(h, oh);
  if (x <= 0) return;
  v.n.H = h - x;
  v.n.OH = oh - x;
  addHeat(v, x * 55.8e3);
}

interface Salt {
  solid: string;
  cat: string;
  a: number;
  an: string;
  b: number;
  ksp: number;
}

/** Sales poco solubles: MₐXᵦ(s) ⇌ a M + b X, con su producto de solubilidad a 25 °C */
const SALTS: Salt[] = [
  { solid: 'AgI', cat: 'Ag', a: 1, an: 'I', b: 1, ksp: 8.5e-17 },
  { solid: 'AgCl', cat: 'Ag', a: 1, an: 'Cl', b: 1, ksp: 1.8e-10 },
  { solid: 'PbI2', cat: 'Pb', a: 1, an: 'I', b: 2, ksp: 9.8e-9 },
  { solid: 'PbCl2', cat: 'Pb', a: 1, an: 'Cl', b: 2, ksp: 1.7e-5 },
  { solid: 'CuOH2', cat: 'Cu', a: 1, an: 'OH', b: 2, ksp: 2.2e-20 },
];

/**
 * Lleva una sal a su equilibrio de solubilidad: precipita si Q > Kps o
 * redisuelve sólido si Q < Kps. Se resuelve el avance ξ por bisección.
 */
function equilibrate(v: Vessel, s: Salt): void {
  const nS = mol(v, s.solid);
  const nM = mol(v, s.cat);
  const nX = mol(v, s.an);
  const isOH = s.an === 'OH';
  if (nS <= 0 && (nM <= 0 || (!isOH && nX <= 0))) return;
  const L = v.vol / 1000;
  if (L <= 1e-9) return;
  const nH = isOH ? mol(v, 'H') : 0;
  const lnK = Math.log(s.ksp);

  // f(ξ) = ln Q − ln Kps, decreciente en ξ (ξ > 0 precipita)
  const f = (xi: number): number => {
    const cM = (nM - s.a * xi) / L;
    const cX = isOH ? ohFromNet((nX - s.b * xi - nH) / L) : (nX - s.b * xi) / L;
    if (cM <= 0 || cX <= 0) return -Infinity;
    return s.a * Math.log(cM) + s.b * Math.log(cX) - lnK;
  };

  let lo = -nS;
  let hi = isOH ? nM / s.a : Math.min(nM / s.a, nX / s.b);
  let xi: number;
  if (f(lo) <= 0) {
    xi = lo; // ni disolviendo todo el sólido se llega a saturar
  } else {
    for (let i = 0; i < 56; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) lo = mid;
      else hi = mid;
    }
    xi = (lo + hi) / 2;
  }
  if (Math.abs(xi) < 1e-13) return;

  v.n[s.cat] = Math.max(0, nM - s.a * xi);
  const left = nX - s.b * xi;
  if (isOH && left < 0) {
    // Hidrólisis: el OH⁻ que falta lo aporta el agua y queda H⁺ libre
    v.n.OH = 0;
    v.n.H = nH - left;
  } else {
    v.n[s.an] = Math.max(0, left);
  }
  const solid = Math.max(0, nS + xi);
  v.n[s.solid] = solid < 1e-10 ? 0 : solid;
  if (xi > 0) v.susp[s.solid] = (v.susp[s.solid] ?? 0) + xi;
  if ((v.susp[s.solid] ?? 0) > v.n[s.solid]) v.susp[s.solid] = v.n[s.solid];
  if (isOH) neutralize(v);
}

/** Aceleración de las reacciones con la temperatura (aprox. Arrhenius). */
function arrhenius(temp: number): number {
  return Math.min(8, Math.pow(2, (temp - 25) / 15));
}

interface AcidAttack {
  solid: string;
  /** Catión que pasa a la solución */
  ion: string;
  gas?: string;
  /** ΔH en J por mol de sólido */
  dH: number;
  k: number;
}

/** Sólido + 2 H⁺ → catión²⁺ (+ H₂). Velocidad ∝ superficie · [H⁺]. */
const ACID_ATTACKS: AcidAttack[] = [
  { solid: 'Zn', ion: 'Zn2', gas: 'H2', dH: -153.9e3, k: 0.08 },
  { solid: 'Mg', ion: 'Mg2', gas: 'H2', dH: -466.9e3, k: 0.5 },
  { solid: 'CuO', ion: 'Cu', dH: -64e3, k: 0.05 },
];

/** Devuelve los moles de gas desprendidos en este paso. */
function kinetics(v: Vessel, dt: number): number {
  let gas = 0;
  const L = v.vol / 1000;
  if (L > 1e-9) {
    for (const r of ACID_ATTACKS) {
      const nS = mol(v, r.solid);
      const nH = mol(v, 'H');
      if (nS <= 0 || nH <= 0) continue;
      const rate = r.k * Math.pow(nS, 2 / 3) * (nH / L) * arrhenius(v.temp);
      const xi = Math.min(rate * dt, nS, nH / 2);
      if (xi <= 0) continue;
      const left = nS - xi;
      v.n[r.solid] = left < 1e-9 ? 0 : left;
      v.n.H = nH - 2 * xi;
      v.n[r.ion] = mol(v, r.ion) + xi;
      addHeat(v, -r.dH * xi);
      if (r.gas) {
        v.gasOut[r.gas] = (v.gasOut[r.gas] ?? 0) + xi;
        gas += xi;
      }
      if ((v.susp[r.solid] ?? 0) > v.n[r.solid]) v.susp[r.solid] = v.n[r.solid];
    }
  }

  // AgCl(s) + I⁻ → AgI(s) + Cl⁻: el yoduro, mucho menos soluble, desplaza al
  // cloruro en la superficie del sólido (K = Kps(AgCl)/Kps(AgI) ≈ 2·10⁶)
  const agcl = mol(v, 'AgCl');
  const iodide = mol(v, 'I');
  if (agcl > 0 && iodide > 1e-9 && mol(v, 'Cl') / iodide < 2e6) {
    let xi = Math.min(agcl, iodide * 0.999) * (1 - Math.exp(-dt / 0.8));
    if (agcl - xi < 1e-8) xi = Math.min(agcl, iodide);
    v.n.AgCl = agcl - xi;
    v.n.I = iodide - xi;
    v.n.Cl = mol(v, 'Cl') + xi;
    v.n.AgI = mol(v, 'AgI') + xi;
    v.susp.AgI = (v.susp.AgI ?? 0) + xi;
    if ((v.susp.AgCl ?? 0) > v.n.AgCl) v.susp.AgCl = v.n.AgCl;
  }

  // Cu(OH)₂(s) → CuO(s) + H₂O: el hidróxido se deshidrata al calentar (≈ 80 °C)
  const hyd = mol(v, 'CuOH2');
  if (hyd > 0 && v.temp > 78) {
    const speed = 0.5 * Math.min(1, (v.temp - 78) / 15);
    let xi = Math.min(hyd, hyd * speed * dt + 2e-7);
    if (hyd - xi < 1e-8) xi = hyd;
    v.n.CuOH2 = hyd - xi;
    v.n.CuO = mol(v, 'CuO') + xi;
    const suspH = v.susp.CuOH2 ?? 0;
    const moved = hyd > 0 ? suspH * (xi / hyd) : 0;
    v.susp.CuOH2 = suspH - moved;
    v.susp.CuO = (v.susp.CuO ?? 0) + moved;
  }
  return gas;
}

function thermal(v: Vessel, dt: number, events?: LabEvent[]): void {
  if (v.heating) addHeat(v, BURNER_W * dt);
  v.temp += (AMBIENT - v.temp) * (1 - Math.exp(-COOLING * dt));
  let boiling = false;
  if (v.temp >= 100) {
    const excess = (v.temp - 100) * heatCapacity(v);
    v.temp = 100;
    if (v.vol > 0) {
      v.vol = Math.max(0, v.vol - excess / VAP_J_PER_ML);
      boiling = v.heating;
    }
  }
  if (boiling && !v.boiling && !v.seen.has('boil')) {
    v.seen.add('boil');
    events?.push({ kind: 'boil' });
  }
  v.boiling = boiling;
  if (v.temp > v.maxTemp) v.maxTemp = v.temp;
}

/** Avanza la simulación de un recipiente `dt` segundos. */
export function step(v: Vessel, dt: number, events?: LabEvent[]): void {
  neutralize(v);
  // Varias pasadas: las sales compiten por los mismos iones (p. ej. AgCl → AgI)
  for (let sweep = 0; sweep < 6; sweep++) for (const s of SALTS) equilibrate(v, s);
  const gas = kinetics(v, dt);
  thermal(v, dt, events);

  // Sedimentación (la ebullición mantiene todo revuelto)
  const settle = Math.exp(-dt / SETTLE_TAU);
  for (const s of POWDERS) {
    const total = mol(v, s.id);
    if (total <= 0) {
      if (v.susp[s.id]) v.susp[s.id] = 0;
      continue;
    }
    let su = (v.susp[s.id] ?? 0) * settle;
    if (v.boiling) su = Math.max(su, total * 0.7);
    v.susp[s.id] = Math.min(su, total);
    if (total > 1e-5 && !v.seen.has(s.id)) {
      v.seen.add(s.id);
      events?.push({ kind: 'solid', sp: s.id });
    }
  }

  const k = 1 - Math.exp(-dt / 0.25);
  v.gasRate += (gas / dt - v.gasRate) * k;
  if (v.gasRate < 1e-9) v.gasRate = 0;
  for (const [sp, n] of Object.entries(v.gasOut)) {
    if (n > 2e-5 && !v.seen.has(sp)) {
      v.seen.add(sp);
      events?.push({ kind: 'gas', sp });
    }
  }
}

// --- Aspecto -----------------------------------------------------------------

export interface LiquidLook {
  rgb: RGB;
  /** Opacidad del líquido (0–1) */
  alpha: number;
  /** Cuánto del aspecto se debe a sólido en suspensión (0–1) */
  turbidity: number;
}

const WATER: RGB = [222, 240, 250];

/** Color del líquido por Beer–Lambert más la turbidez del sólido en suspensión. */
export function liquidLook(v: Vessel): LiquidLook {
  const L = v.vol / 1000;
  if (L <= 1e-9) return { rgb: WATER, alpha: 0, turbidity: 0 };
  const p = pH(v) ?? 7;
  let aR = 0;
  let aG = 0;
  let aB = 0;
  for (const s of COLORED) {
    const c = mol(v, s.id) / L;
    if (c <= 0) continue;
    const ab = s.absorb!(p);
    aR += ab[0] * c;
    aG += ab[1] * c;
    aB += ab[2] * c;
  }
  const tR = Math.exp(-aR);
  const tG = Math.exp(-aG);
  const tB = Math.exp(-aB);
  let r = WATER[0] * tR;
  let g = WATER[1] * tG;
  let b = WATER[2] * tB;
  let alpha = 0.26 + 0.7 * (1 - Math.min(tR, tG, tB));

  let tau = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const s of POWDERS) {
    const su = v.susp[s.id] ?? 0;
    if (su <= 0) continue;
    const w = (su / L) * 45;
    tau += w;
    sr += s.solid!.color[0] * w;
    sg += s.solid!.color[1] * w;
    sb += s.solid!.color[2] * w;
  }
  let turbidity = 0;
  if (tau > 0) {
    turbidity = 1 - Math.exp(-tau);
    r += (sr / tau - r) * turbidity;
    g += (sg / tau - g) * turbidity;
    b += (sb / tau - b) * turbidity;
    alpha += (0.97 - alpha) * turbidity;
  }
  return { rgb: [r, g, b], alpha: Math.min(0.97, alpha), turbidity };
}

export interface Sediment {
  /** Volumen aparente del sedimento, mL */
  ml: number;
  rgb: RGB;
}

/** Capa de precipitado ya depositada en el fondo. */
export function sediment(v: Vessel): Sediment {
  let ml = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const s of POWDERS) {
    const settled = mol(v, s.id) - (v.susp[s.id] ?? 0);
    if (settled <= 0) continue;
    const vol = settled * s.M! * s.solid!.bulk;
    ml += vol;
    r += s.solid!.color[0] * vol;
    g += s.solid!.color[1] * vol;
    b += s.solid!.color[2] * vol;
  }
  if (ml <= 0) return { ml: 0, rgb: [255, 255, 255] };
  return { ml, rgb: [r / ml, g / ml, b / ml] };
}
