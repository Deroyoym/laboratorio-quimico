import type { PieceKind, RGB } from './species';

/**
 * Reactivos de la estantería.
 *
 * - 'liquid': frasco; `contents` son mol por mL y la dosis la elige el jugador.
 * - 'dropper': gotero; cada uso agrega `doseMl` (unas gotas).
 * - 'solid': pote; `contents` son mol por cucharada/trozo.
 */
export interface ReagentDef {
  id: string;
  name: string;
  /** Nombre partido en hasta dos renglones para la estantería */
  caption: [string, string?];
  formula: string;
  conc: string;
  kind: 'liquid' | 'dropper' | 'solid';
  contents: Record<string, number>;
  doseMl?: number;
  doseLabel?: string;
  /** Color con el que se ve dentro del envase */
  color: RGB;
  /** Cómo se dibujan los trozos del sólido (en el pote y al caer) */
  piece?: PieceKind;
}

const perMl = (molPerL: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(molPerL).map(([k, v]) => [k, v / 1000]));

const CLEAR: RGB = [226, 240, 248];

const list: ReagentDef[] = [
  {
    id: 'agua',
    name: 'Agua destilada',
    caption: ['Agua', 'destilada'],
    formula: 'H₂O',
    conc: '',
    kind: 'liquid',
    contents: {},
    color: [214, 236, 250],
  },
  {
    id: 'hcl01',
    name: 'Ácido clorhídrico',
    caption: ['Ácido', 'clorhídrico'],
    formula: 'HCl',
    conc: '0,1 M',
    kind: 'liquid',
    contents: perMl({ H: 0.1, Cl: 0.1 }),
    color: CLEAR,
  },
  {
    id: 'hcl1',
    name: 'Ácido clorhídrico',
    caption: ['Ácido', 'clorhídrico'],
    formula: 'HCl',
    conc: '1 M',
    kind: 'liquid',
    contents: perMl({ H: 1, Cl: 1 }),
    color: CLEAR,
  },
  {
    id: 'hcl2',
    name: 'Ácido clorhídrico',
    caption: ['Ácido', 'clorhídrico'],
    formula: 'HCl',
    conc: '2 M',
    kind: 'liquid',
    contents: perMl({ H: 2, Cl: 2 }),
    color: CLEAR,
  },
  {
    id: 'naoh01',
    name: 'Hidróxido de sodio',
    caption: ['Hidróxido', 'de sodio'],
    formula: 'NaOH',
    conc: '0,1 M',
    kind: 'liquid',
    contents: perMl({ Na: 0.1, OH: 0.1 }),
    color: CLEAR,
  },
  {
    id: 'naoh1',
    name: 'Hidróxido de sodio',
    caption: ['Hidróxido', 'de sodio'],
    formula: 'NaOH',
    conc: '1 M',
    kind: 'liquid',
    contents: perMl({ Na: 1, OH: 1 }),
    color: CLEAR,
  },
  {
    id: 'fenol',
    name: 'Fenolftaleína',
    caption: ['Fenol-', 'ftaleína'],
    formula: 'Fenolft.',
    conc: 'indicador',
    kind: 'dropper',
    contents: perMl({ PhPh: 0.016 }),
    doseMl: 0.15,
    doseLabel: '3 gotas',
    color: [240, 236, 226],
  },
  {
    id: 'univ',
    name: 'Indicador universal',
    caption: ['Indicador', 'universal'],
    formula: 'Ind. univ.',
    conc: 'indicador',
    kind: 'dropper',
    contents: perMl({ UI: 0.008 }),
    doseMl: 0.25,
    doseLabel: '5 gotas',
    color: [60, 120, 70],
  },
  {
    id: 'ki',
    name: 'Yoduro de potasio',
    caption: ['Yoduro', 'de potasio'],
    formula: 'KI',
    conc: '0,5 M',
    kind: 'liquid',
    contents: perMl({ K: 0.5, I: 0.5 }),
    color: CLEAR,
  },
  {
    id: 'pbno3',
    name: 'Nitrato de plomo(II)',
    caption: ['Nitrato', 'de plomo'],
    formula: 'Pb(NO₃)₂',
    conc: '0,5 M',
    kind: 'liquid',
    contents: perMl({ Pb: 0.5, NO3: 1 }),
    color: CLEAR,
  },
  {
    id: 'nacl',
    name: 'Cloruro de sodio',
    caption: ['Cloruro', 'de sodio'],
    formula: 'NaCl',
    conc: '1 M',
    kind: 'liquid',
    contents: perMl({ Na: 1, Cl: 1 }),
    color: CLEAR,
  },
  {
    id: 'agno3',
    name: 'Nitrato de plata',
    caption: ['Nitrato', 'de plata'],
    formula: 'AgNO₃',
    conc: '0,1 M',
    kind: 'liquid',
    contents: perMl({ Ag: 0.1, NO3: 0.1 }),
    color: CLEAR,
  },
  {
    id: 'cuso4',
    name: 'Sulfato de cobre(II)',
    caption: ['Sulfato', 'de cobre'],
    formula: 'CuSO₄',
    conc: '0,5 M',
    kind: 'liquid',
    contents: perMl({ Cu: 0.5, SO4: 0.5 }),
    color: [58, 158, 236],
  },
  {
    id: 'zn',
    name: 'Zinc en granallas',
    caption: ['Zinc', '(granallas)'],
    formula: 'Zn',
    conc: '0,5 g',
    kind: 'solid',
    contents: { Zn: 0.5 / 65.38 },
    doseLabel: '0,5 g',
    color: [150, 157, 166],
    piece: 'granalla',
  },
  {
    id: 'mg',
    name: 'Cinta de magnesio',
    caption: ['Magnesio', '(cinta)'],
    formula: 'Mg',
    conc: '0,1 g',
    kind: 'solid',
    contents: { Mg: 0.1 / 24.305 },
    doseLabel: '0,1 g',
    color: [206, 211, 216],
    piece: 'cinta',
  },
  {
    id: 'cu',
    name: 'Virutas de cobre',
    caption: ['Cobre', '(virutas)'],
    formula: 'Cu',
    conc: '0,5 g',
    kind: 'solid',
    contents: { CuM: 0.5 / 63.546 },
    doseLabel: '0,5 g',
    color: [190, 104, 58],
    piece: 'viruta',
  },
  {
    id: 'hcl6',
    name: 'Ácido clorhídrico',
    caption: ['Ácido', 'clorhídrico'],
    formula: 'HCl',
    conc: '6 M',
    kind: 'liquid',
    contents: perMl({ H: 6, Cl: 6 }),
    color: CLEAR,
  },
  {
    id: 'naoh6',
    name: 'Hidróxido de sodio',
    caption: ['Hidróxido', 'de sodio'],
    formula: 'NaOH',
    conc: '6 M',
    kind: 'liquid',
    contents: perMl({ Na: 6, OH: 6 }),
    color: CLEAR,
  },
  {
    id: 'agno3_05',
    name: 'Nitrato de plata',
    caption: ['Nitrato', 'de plata'],
    formula: 'AgNO₃',
    conc: '0,5 M',
    kind: 'liquid',
    contents: perMl({ Ag: 0.5, NO3: 0.5 }),
    color: CLEAR,
  },
  {
    id: 'cu5',
    name: 'Alambre de cobre',
    caption: ['Cobre', '(alambre)'],
    formula: 'Cu',
    conc: '0,318 g',
    kind: 'solid',
    // 0,318 g ÷ 63,55 g/mol = 5,00 mmol
    contents: { CuM: 0.005 },
    doseLabel: '0,318 g (5 mmol)',
    color: [190, 104, 58],
    piece: 'viruta',
  },
  {
    id: 'nh4no3',
    name: 'Nitrato de amonio',
    caption: ['Nitrato', 'de amonio'],
    formula: 'NH₄NO₃',
    conc: '5 g',
    kind: 'solid',
    contents: { NH4NO3_s: 5 / 80.04 },
    doseLabel: '5 g',
    color: [244, 246, 250],
    piece: 'cristal',
  },
  {
    id: 'cacl2',
    name: 'Cloruro de calcio',
    caption: ['Cloruro', 'de calcio'],
    formula: 'CaCl₂',
    conc: '5 g',
    kind: 'solid',
    contents: { CaCl2_s: 5 / 110.98 },
    doseLabel: '5 g',
    color: [232, 234, 238],
    piece: 'cristal',
  },
  {
    id: 'sal',
    name: 'Sal de mesa',
    caption: ['Sal', 'de mesa'],
    formula: 'NaCl',
    conc: '5 g',
    kind: 'solid',
    contents: { NaCl_s: 5 / 58.44 },
    doseLabel: '5 g',
    color: [250, 250, 252],
    piece: 'cristal',
  },
  {
    // Solo como contenido inicial de un recipiente
    id: 'cuo',
    name: 'Óxido de cobre(II)',
    caption: ['Óxido', 'de cobre'],
    formula: 'CuO',
    conc: '0,80 g',
    kind: 'solid',
    contents: { CuO: 0.01 },
    doseLabel: '0,80 g (10 mmol)',
    color: [30, 27, 26],
    piece: 'polvo',
  },
];

export const REAGENTS: Record<string, ReagentDef> = Object.fromEntries(list.map((r) => [r.id, r]));
