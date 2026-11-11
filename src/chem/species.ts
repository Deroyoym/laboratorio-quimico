/**
 * Catálogo de especies químicas.
 *
 * - Las especies acuosas pueden absorber luz: `absorb(pH)` devuelve la
 *   absorbancia por canal RGB para una concentración de 1 mol/L. El color del
 *   líquido se calcula con Beer–Lambert, así que diluir aclara de verdad.
 * - Los sólidos tienen color propio y una forma de dibujarse (polvo que
 *   sedimenta o trozos de metal).
 */

export type RGB = [number, number, number];
export type Phase = 'aq' | 's' | 'g';

export interface SolidLook {
  color: RGB;
  /** 'powder' = precipitado fino que sedimenta; 'chunk' = trozos de metal */
  kind: 'powder' | 'chunk';
  /** Volumen aparente del sedimento (mL por gramo), exagerado para que se vea */
  bulk: number;
  piece?: 'granalla' | 'cinta' | 'viruta';
}

export interface SpeciesDef {
  id: string;
  formula: string;
  name: string;
  phase: Phase;
  /** Masa molar (g/mol) */
  M?: number;
  absorb?: (pH: number) => RGB;
  solid?: SolidLook;
  /** Observación que se muestra la primera vez que aparece */
  obs?: string;
}

// --- Indicadores -----------------------------------------------------------

/** Color transmitido del indicador universal según el pH (0–1 por canal). */
const UI_STOPS: [number, RGB][] = [
  [0, [0.86, 0.08, 0.12]],
  [2, [0.92, 0.16, 0.1]],
  [3, [0.95, 0.32, 0.1]],
  [4, [0.97, 0.5, 0.1]],
  [5, [0.98, 0.7, 0.12]],
  [6, [0.94, 0.86, 0.16]],
  [7, [0.36, 0.74, 0.24]],
  [8, [0.14, 0.62, 0.48]],
  [9, [0.14, 0.46, 0.74]],
  [10, [0.2, 0.3, 0.74]],
  [12, [0.4, 0.2, 0.64]],
  [14, [0.46, 0.14, 0.54]],
];

export function universalColor(pH: number): RGB {
  const p = Math.max(0, Math.min(14, pH));
  for (let i = 1; i < UI_STOPS.length; i++) {
    const [p1, c1] = UI_STOPS[i];
    if (p <= p1) {
      const [p0, c0] = UI_STOPS[i - 1];
      const t = (p - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return UI_STOPS[UI_STOPS.length - 1][1];
}

/** Concentración a la que el indicador universal muestra su color "de catálogo" */
const UI_REF = 3e-5;

function universalAbsorb(pH: number): RGB {
  const c = universalColor(pH);
  return [-Math.log(c[0]) / UI_REF, -Math.log(c[1]) / UI_REF, -Math.log(c[2]) / UI_REF];
}

/** Fenolftaleína: incolora por debajo de pH ≈ 8,2; fucsia por encima. */
function phenolphthaleinAbsorb(pH: number): RGB {
  const f = 1 / (1 + Math.pow(10, 9.3 - pH));
  return [2400 * f, 48000 * f, 14000 * f];
}

// --- Catálogo --------------------------------------------------------------

const list: SpeciesDef[] = [
  { id: 'H', formula: 'H⁺', name: 'ion hidrógeno', phase: 'aq' },
  { id: 'OH', formula: 'OH⁻', name: 'ion hidróxido', phase: 'aq' },
  { id: 'Na', formula: 'Na⁺', name: 'ion sodio', phase: 'aq' },
  { id: 'K', formula: 'K⁺', name: 'ion potasio', phase: 'aq' },
  { id: 'Cl', formula: 'Cl⁻', name: 'ion cloruro', phase: 'aq' },
  { id: 'I', formula: 'I⁻', name: 'ion yoduro', phase: 'aq' },
  { id: 'NO3', formula: 'NO₃⁻', name: 'ion nitrato', phase: 'aq' },
  { id: 'SO4', formula: 'SO₄²⁻', name: 'ion sulfato', phase: 'aq' },
  { id: 'Ag', formula: 'Ag⁺', name: 'ion plata', phase: 'aq' },
  { id: 'Pb', formula: 'Pb²⁺', name: 'ion plomo(II)', phase: 'aq' },
  { id: 'Zn2', formula: 'Zn²⁺', name: 'ion zinc', phase: 'aq' },
  { id: 'Mg2', formula: 'Mg²⁺', name: 'ion magnesio', phase: 'aq' },
  {
    id: 'Cu',
    formula: 'Cu²⁺',
    name: 'ion cobre(II)',
    phase: 'aq',
    // El acuocomplejo de cobre absorbe en el rojo: se ve celeste-azul
    absorb: () => [3.0, 0.9, 0.15],
  },
  { id: 'PhPh', formula: 'HIn', name: 'fenolftaleína', phase: 'aq', absorb: phenolphthaleinAbsorb },
  { id: 'UI', formula: 'Ind', name: 'indicador universal', phase: 'aq', absorb: universalAbsorb },

  // Sólidos
  {
    id: 'AgCl',
    formula: 'AgCl',
    name: 'cloruro de plata',
    phase: 's',
    M: 143.32,
    solid: { color: [246, 246, 242], kind: 'powder', bulk: 6 },
    obs: 'Precipitado blanco: cloruro de plata (AgCl)',
  },
  {
    id: 'AgI',
    formula: 'AgI',
    name: 'yoduro de plata',
    phase: 's',
    M: 234.77,
    solid: { color: [238, 232, 170], kind: 'powder', bulk: 6 },
    obs: 'Precipitado amarillo pálido: yoduro de plata (AgI)',
  },
  {
    id: 'PbI2',
    formula: 'PbI₂',
    name: 'yoduro de plomo(II)',
    phase: 's',
    M: 461.01,
    solid: { color: [248, 194, 14], kind: 'powder', bulk: 6 },
    obs: 'Precipitado amarillo dorado: yoduro de plomo (PbI₂)',
  },
  {
    id: 'PbCl2',
    formula: 'PbCl₂',
    name: 'cloruro de plomo(II)',
    phase: 's',
    M: 278.1,
    solid: { color: [240, 241, 238], kind: 'powder', bulk: 6 },
    obs: 'Precipitado blanco: cloruro de plomo (PbCl₂)',
  },
  {
    id: 'CuOH2',
    formula: 'Cu(OH)₂',
    name: 'hidróxido de cobre(II)',
    phase: 's',
    M: 97.56,
    solid: { color: [96, 176, 232], kind: 'powder', bulk: 14 },
    obs: 'Precipitado celeste gelatinoso: hidróxido de cobre (Cu(OH)₂)',
  },
  {
    id: 'CuO',
    formula: 'CuO',
    name: 'óxido de cobre(II)',
    phase: 's',
    M: 79.55,
    solid: { color: [30, 27, 26], kind: 'powder', bulk: 12 },
    obs: 'El sólido se ennegrece: óxido de cobre (CuO)',
  },
  {
    id: 'Zn',
    formula: 'Zn',
    name: 'zinc',
    phase: 's',
    M: 65.38,
    solid: { color: [150, 157, 166], kind: 'chunk', bulk: 0, piece: 'granalla' },
  },
  {
    id: 'Mg',
    formula: 'Mg',
    name: 'magnesio',
    phase: 's',
    M: 24.305,
    solid: { color: [206, 211, 216], kind: 'chunk', bulk: 0, piece: 'cinta' },
  },
  {
    id: 'CuM',
    formula: 'Cu',
    name: 'cobre',
    phase: 's',
    M: 63.546,
    solid: { color: [190, 104, 58], kind: 'chunk', bulk: 0, piece: 'viruta' },
  },

  // Gases
  {
    id: 'H2',
    formula: 'H₂',
    name: 'hidrógeno',
    phase: 'g',
    obs: 'Burbujeo: se desprende hidrógeno (H₂)',
  },
];

export const SPECIES: Record<string, SpeciesDef> = Object.fromEntries(list.map((s) => [s.id, s]));

export const SOLIDS: SpeciesDef[] = list.filter((s) => s.phase === 's');
export const POWDERS: SpeciesDef[] = SOLIDS.filter((s) => s.solid!.kind === 'powder');
export const CHUNKS: SpeciesDef[] = SOLIDS.filter((s) => s.solid!.kind === 'chunk');
export const COLORED: SpeciesDef[] = list.filter((s) => s.absorb);
