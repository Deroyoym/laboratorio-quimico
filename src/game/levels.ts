import type { VesselKind } from '../chem/engine';
import type { Cond } from './goals';

export interface VesselSpec {
  kind: VesselKind;
  capacity: number;
  /** Posición horizontal (0–1) sobre la mesada */
  x: number;
  /** Contenido inicial: [reactivo, mL o dosis] */
  initial?: [string, number][];
}

export interface LevelDef {
  id: string;
  title: string;
  /** Concepto que trabaja el nivel */
  tag: string;
  brief: string;
  reagents: string[];
  vessels: VesselSpec[];
  tools: {
    burner?: boolean;
    phMeter?: boolean;
    /** Gas que se recoge y se mide */
    gas?: string;
  };
  doses: number[];
  goals: Cond[];
  /** Cantidad de acciones de una solución ideal (para las estrellas) */
  par: number;
  hints: string[];
  /** Explicación que se muestra al ganar (HTML propio, sin datos externos) */
  explain: string;
}

export const LEVELS: LevelDef[] = [
  {
    id: 'viraje',
    title: 'Primer viraje',
    tag: 'Color · indicadores',
    brief:
      'La fenolftaleína es incolora en medio ácido o neutro y fucsia en medio básico. Hacé que el agua del vaso se ponga fucsia.',
    reagents: ['fenol', 'naoh01', 'hcl01', 'agua'],
    vessels: [{ kind: 'vaso', capacity: 100, x: 0.5, initial: [['agua', 40]] }],
    tools: {},
    doses: [1, 5, 10, 25],
    goals: [
      { kind: 'has', sp: 'PhPh', min: 1e-7, label: 'Indicador en el vaso' },
      { kind: 'ph', min: 8.5, max: 14, label: 'Medio básico: solución fucsia' },
    ],
    par: 2,
    hints: [
      'Tocá un frasco para elegirlo y después tocá el vaso para verter. También podés arrastrarlo hasta el vaso.',
      'Agregá unas gotas de fenolftaleína y después un poco de hidróxido de sodio (NaOH), que es una base.',
    ],
    explain:
      '<p>La fenolftaleína es un <b>indicador ácido-base</b>: por encima de pH ≈ 8,2 pierde protones y pasa a una forma que absorbe la luz verde, por eso se ve fucsia.</p>' +
      '<p class="eq">NaOH → Na⁺ + OH⁻</p>' +
      '<p>Los iones OH⁻ vuelven básica la solución. Si agregás HCl, sus H⁺ neutralizan a los OH⁻ y el color desaparece.</p>',
  },
  {
    id: 'neutralizacion',
    title: 'Neutralización exacta',
    tag: 'pH · calor de reacción',
    brief:
      'El vaso tiene 20 mL de HCl 2 M con indicador universal. Neutralizalo con NaOH 1 M hasta dejarlo en pH 7. Mirá el termómetro: la reacción libera calor.',
    reagents: ['naoh1', 'hcl2', 'agua'],
    vessels: [
      {
        kind: 'vaso',
        capacity: 100,
        x: 0.5,
        initial: [
          ['hcl2', 20],
          ['univ', 0.25],
        ],
      },
    ],
    tools: { phMeter: true },
    doses: [1, 5, 10, 25],
    goals: [
      { kind: 'ph', min: 6.5, max: 7.5, label: 'pH neutro (6,5 – 7,5)' },
      { kind: 'salt', cat: 'Na', an: 'Cl', M: 58.44, grams: 2.3, label: 'Sal formada: 2,3 g de NaCl' },
    ],
    par: 4,
    hints: [
      'En el punto de equivalencia los moles de OH⁻ agregados igualan a los de H⁺ que había: n = M × V.',
      'En el vaso hay 20 mL × 2 M = 40 mmol de H⁺. ¿Cuántos mL de NaOH 1 M contienen 40 mmol de OH⁻?',
      'Hacen falta 40 mL de NaOH. Si te pasaste, 1 mL de HCl 2 M neutraliza 2 mL de NaOH 1 M.',
    ],
    explain:
      '<p class="eq">HCl + NaOH → NaCl + H₂O &nbsp; ΔH ≈ −56 kJ/mol</p>' +
      '<p>Cada H⁺ del ácido se une a un OH⁻ de la base y forma agua. La reacción es <b>exotérmica</b>: por eso subió el termómetro.</p>' +
      '<p>Cerca del punto de equivalencia el pH salta de golpe: con un ácido y una base fuertes, 1 mL de más alcanza para pasar de pH 2 a pH 12. Lo que queda en el vaso es agua salada.</p>',
  },
  {
    id: 'lluvia-de-oro',
    title: 'Lluvia de oro',
    tag: 'Precipitación',
    brief:
      'Al mezclar dos soluciones incoloras puede aparecer un sólido. Conseguí al menos 1 g de precipitado amarillo dorado, y que sea el único sólido del recipiente. Usá los tubos de ensayo para probar.',
    reagents: ['ki', 'pbno3', 'nacl', 'agno3'],
    vessels: [
      { kind: 'vaso', capacity: 50, x: 0.33 },
      { kind: 'tubo', capacity: 20, x: 0.68 },
      { kind: 'tubo', capacity: 20, x: 0.84 },
    ],
    tools: {},
    doses: [1, 5, 10],
    goals: [
      { kind: 'solidMin', sp: 'PbI2', grams: 1, label: 'Precipitado amarillo dorado ≥ 1 g' },
      { kind: 'onlySolid', sp: 'PbI2', label: 'Sin otros sólidos en el recipiente' },
    ],
    par: 3,
    hints: [
      'Probá combinaciones de a dos en los tubos de ensayo y fijate qué sólido aparece. Con «Vaciar» lavás el recipiente elegido.',
      'El dorado es yoduro de plomo: necesitás iones Pb²⁺ y I⁻, y nada que traiga plata o cloruro.',
      'Pb²⁺ + 2 I⁻ → PbI₂: hace falta el doble de yoduro que de plomo. Con 5 mL de Pb(NO₃)₂ y 10 mL de KI alcanza.',
    ],
    explain:
      '<p class="eq">Pb(NO₃)₂ + 2 KI → PbI₂↓ + 2 KNO₃</p>' +
      '<p>El yoduro de plomo es muy poco soluble (K<sub>ps</sub> ≈ 10⁻⁸): cuando el producto de las concentraciones de Pb²⁺ y I⁻ supera ese valor, el exceso <b>precipita</b>. El K⁺ y el NO₃⁻ quedan disueltos como iones espectadores.</p>' +
      '<p>Las otras mezclas dan sólidos distintos: AgCl y PbCl₂ blancos, AgI amarillo pálido.</p>',
  },
  {
    id: 'hidrogeno',
    title: 'Hidrógeno bajo control',
    tag: 'Gases · temperatura',
    brief:
      'Algunos metales reaccionan con el ácido y liberan hidrógeno… y mucho calor. Recogé 150 mL de H₂ sin que el erlenmeyer pase de 40 °C.',
    reagents: ['hcl2', 'agua', 'zn', 'mg', 'cu'],
    vessels: [{ kind: 'erlenmeyer', capacity: 100, x: 0.5 }],
    tools: { gas: 'H2' },
    doses: [5, 10, 25],
    goals: [
      { kind: 'gasMin', sp: 'H2', ml: 150, label: 'Recoger 150 mL de H₂' },
      { kind: 'tempNever', max: 40, label: 'Nunca superar los 40 °C' },
    ],
    par: 4,
    hints: [
      'No todos los metales reaccionan con HCl: probá cuál burbujea y cuál no hace nada.',
      'Si se calienta demasiado, vaciá y empezá de nuevo con agua en el erlenmeyer: más líquido absorbe más calor.',
      'Una receta que funciona: 25 mL de agua + 10 mL de HCl 2 M + una cucharada de zinc.',
    ],
    explain:
      '<p class="eq">Zn + 2 HCl → ZnCl₂ + H₂↑ &nbsp; ΔH ≈ −154 kJ/mol</p>' +
      '<p>El zinc y el magnesio son más reactivos que el hidrógeno y lo <b>desplazan</b> del ácido; el cobre no, por eso no pasa nada con él. El magnesio libera el triple de calor por mol que el zinc.</p>' +
      '<p>El calor liberado es el mismo con o sin agua, pero al diluir se reparte en más masa y la temperatura sube menos: ΔT = Q / (m · c).</p>',
  },
  {
    id: 'oxido-de-cobre',
    title: 'Del celeste al negro',
    tag: 'Síntesis en dos pasos',
    brief:
      'Prepará óxido de cobre(II), un sólido negro. Primero precipitá el cobre de la solución azul; después calentá con el mechero. El líquido final tiene que quedar incoloro y casi neutro.',
    reagents: ['cuso4', 'naoh1', 'hcl1', 'agua'],
    vessels: [{ kind: 'vaso', capacity: 50, x: 0.5 }],
    tools: { burner: true, phMeter: true },
    doses: [1, 5, 10, 25],
    goals: [
      { kind: 'solidMin', sp: 'CuO', grams: 0.35, label: 'Óxido de cobre negro ≥ 0,35 g' },
      { kind: 'noSolid', sp: 'CuOH2', label: 'Sin restos de hidróxido celeste' },
      { kind: 'aqMax', sp: 'Cu', conc: 1e-3, label: 'Líquido incoloro (sin Cu²⁺)' },
      { kind: 'ph', min: 6, max: 9, label: 'pH final entre 6 y 9' },
    ],
    par: 3,
    hints: [
      'Una base hace precipitar al cobre como hidróxido celeste. Después, el calor lo transforma.',
      'Cu²⁺ + 2 OH⁻ → Cu(OH)₂: hacen falta 2 moles de NaOH por cada mol de CuSO₄. Si sobra base, el pH queda muy alto.',
      '10 mL de CuSO₄ 0,5 M + 10 mL de NaOH 1 M, y encendé el mechero hasta que todo el sólido se vuelva negro (unos 80 °C).',
    ],
    explain:
      '<p class="eq">CuSO₄ + 2 NaOH → Cu(OH)₂↓ + Na₂SO₄</p>' +
      '<p class="eq">Cu(OH)₂ —calor→ CuO + H₂O</p>' +
      '<p>El hidróxido de cobre es un precipitado celeste gelatinoso. Al calentarlo cerca de 80 °C <b>se deshidrata</b> y queda óxido de cobre(II), negro. Con las cantidades justas, todo el cobre termina en el sólido y en el líquido solo queda sulfato de sodio disuelto.</p>',
  },
];
