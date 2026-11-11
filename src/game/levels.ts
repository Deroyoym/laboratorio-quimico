import type { VesselKind } from '../chem/engine';
import type { Cond } from './goals';

export interface VesselSpec {
  kind: VesselKind;
  capacity: number;
  /** Posición horizontal (0–1) sobre la mesada */
  x: number;
  /** Contenido inicial: [reactivo, mL o dosis] */
  initial?: [string, number][];
  /** Recipiente de referencia: está tapado, no se le agrega ni se vacía */
  locked?: boolean;
  /** Cartelito que lo identifica en la mesada */
  tag?: string;
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
  {
    id: 'dilucion',
    title: 'Dilución a medida',
    tag: 'Concentración · color',
    brief:
      'El tubo tapado es un patrón de CuSO₄ 0,20 M. Prepará en el vaso al menos 50 mL de solución del mismo color, usando la solución concentrada 0,5 M y agua.',
    reagents: ['cuso4', 'agua'],
    vessels: [
      { kind: 'vaso', capacity: 100, x: 0.4 },
      {
        kind: 'tubo',
        capacity: 20,
        x: 0.84,
        locked: true,
        tag: 'Patrón',
        initial: [
          ['cuso4', 6],
          ['agua', 9],
        ],
      },
    ],
    tools: {},
    doses: [1, 5, 10, 25],
    goals: [
      { kind: 'concRange', sp: 'Cu', min: 0.19, max: 0.21, label: 'Mismo color que el patrón' },
      { kind: 'volMin', min: 50, label: 'Al menos 50 mL de solución' },
    ],
    par: 4,
    hints: [
      'Al agregar agua los moles de soluto no cambian, solo se reparten en más volumen: C₁ · V₁ = C₂ · V₂.',
      'Para 50 mL de solución 0,20 M hacen falta 0,20 M × 50 mL = 10 mmol de CuSO₄. ¿En cuántos mL de la solución 0,5 M están?',
      '20 mL de CuSO₄ 0,5 M y 30 mL de agua.',
    ],
    explain:
      '<p class="eq">C₁ · V₁ = C₂ · V₂ → 0,5 M · 20 mL = 0,20 M · 50 mL</p>' +
      '<p>Diluir no cambia la cantidad de soluto, solo el volumen en el que está repartido. Por eso la solución se ve más clara: la luz atraviesa menos iones Cu²⁺ en el mismo espesor (ley de <b>Beer–Lambert</b>).</p>' +
      '<p>Comparar el color con un patrón de concentración conocida es la base de la colorimetría.</p>',
  },
  {
    id: 'frio',
    title: 'Frío instantáneo',
    tag: 'Calor de disolución',
    brief:
      'Disolver una sal puede calentar o enfriar el agua. Encontrá la que sirve para una compresa fría y bajá la temperatura a 8 °C o menos, con al menos 25 mL de solución.',
    reagents: ['agua', 'nh4no3', 'cacl2', 'sal'],
    vessels: [{ kind: 'vaso', capacity: 100, x: 0.5 }],
    tools: {},
    doses: [5, 10, 25],
    goals: [
      { kind: 'tempMax', max: 8, label: 'Enfriar a 8 °C o menos' },
      { kind: 'volMin', min: 25, label: 'Al menos 25 mL de solución' },
    ],
    par: 3,
    hints: [
      'Probá cada sal con un poco de agua y mirá el termómetro: una calienta, otra casi no cambia y otra enfría.',
      'El nitrato de amonio absorbe calor al disolverse. Cuanta más sal en menos agua, más baja la temperatura.',
      '25 mL de agua y dos cucharadas de nitrato de amonio.',
    ],
    explain:
      '<p class="eq">NH₄NO₃(s) → NH₄⁺ + NO₃⁻ &nbsp; ΔH ≈ +26 kJ/mol</p>' +
      '<p>Para separar los iones del cristal hace falta energía, y al rodearse de agua la devuelven. En el nitrato de amonio gana lo primero: la disolución es <b>endotérmica</b> y le saca calor al agua. Así funcionan las compresas frías instantáneas.</p>' +
      '<p>El cloruro de calcio hace lo contrario (−83 kJ/mol, calienta) y la sal de mesa casi no cambia la temperatura.</p>',
  },
  {
    id: 'arbol-de-plata',
    title: 'Árbol de plata',
    tag: 'Desplazamiento · estequiometría',
    brief:
      'El cobre es más reactivo que la plata y la saca de la solución. Obtené al menos 1 g de plata metálica pura: sin cobre sin reaccionar y sin plata disuelta de sobra.',
    reagents: ['agno3_05', 'cu5', 'nacl', 'agua'],
    vessels: [{ kind: 'vaso', capacity: 50, x: 0.5 }],
    tools: {},
    doses: [1, 5, 10, 25],
    goals: [
      { kind: 'solidMin', sp: 'AgM', grams: 1, label: 'Plata metálica ≥ 1,0 g' },
      { kind: 'onlySolid', sp: 'AgM', label: 'Plata sola: sin cobre ni otros sólidos' },
      { kind: 'aqMax', sp: 'Ag', conc: 1e-3, label: 'Sin plata disuelta de sobra' },
    ],
    par: 3,
    hints: [
      'Poné el alambre de cobre en nitrato de plata y mirá: crece plata sobre el cobre y el líquido se pone celeste.',
      'Cu + 2 Ag⁺ → Cu²⁺ + 2 Ag: cada mol de cobre necesita dos moles de plata. El alambre tiene 5 mmol de cobre.',
      'Un alambre de cobre (5 mmol) y 20 mL de AgNO₃ 0,5 M (10 mmol). El cloruro de sodio arruina todo: precipita AgCl.',
    ],
    explain:
      '<p class="eq">Cu(s) + 2 AgNO₃ → Cu(NO₃)₂ + 2 Ag(s)</p>' +
      '<p>Es una reacción de <b>desplazamiento</b>: el cobre cede electrones más fácilmente que la plata, se disuelve como Cu²⁺ (por eso el líquido se vuelve celeste) y los iones Ag⁺ se depositan como metal.</p>' +
      '<p>Con las cantidades justas, 1 mol de cobre por cada 2 de plata, no sobra ninguno de los dos: ninguno es el reactivo en exceso.</p>',
  },
  {
    id: 'sal',
    title: 'Sal de laboratorio',
    tag: 'Neutralización · cristalización',
    brief:
      'La sal de mesa se puede fabricar con un ácido y una base. Neutralizá con cuidado (son soluciones concentradas) y después evaporá el agua con el mechero hasta que aparezcan los cristales.',
    reagents: ['hcl6', 'naoh6', 'agua'],
    vessels: [{ kind: 'vaso', capacity: 30, x: 0.5 }],
    tools: { burner: true, phMeter: true },
    doses: [1, 5, 10],
    goals: [
      { kind: 'solidMin', sp: 'NaCl_s', grams: 0.5, label: 'Cristales de sal ≥ 0,5 g' },
      { kind: 'ph', min: 6, max: 8, label: 'Líquido neutro (pH 6 – 8)' },
    ],
    par: 3,
    hints: [
      'Primero formá la sal disuelta: ácido y base en cantidades iguales de moles. Fijate cuánto sube la temperatura.',
      'La sal no aparece porque está disuelta. Al hervir se va el agua y la solución se concentra hasta saturarse.',
      '5 mL de HCl 6 M y 5 mL de NaOH 6 M. Después dejá el mechero prendido hasta que queden pocos mL.',
    ],
    explain:
      '<p class="eq">HCl + NaOH → NaCl + H₂O</p>' +
      '<p>Después de neutralizar, en el vaso solo hay iones Na⁺ y Cl⁻ en agua. Al evaporar, el agua se va pero los iones no: la solución se concentra hasta la <b>saturación</b> (unos 360 g de sal por litro) y el exceso cristaliza.</p>' +
      '<p>Con soluciones 6 M la neutralización libera tanto calor que la mezcla se calienta casi 30 °C sola.</p>',
  },
  {
    id: 'ciclo-del-cobre',
    title: 'El ciclo del cobre',
    tag: 'Desafío final',
    brief:
      'En el vaso hay 0,80 g de óxido de cobre(II), el polvo negro del nivel 5. Recuperá el cobre como metal: tiene que quedar solo cobre en el fondo y el líquido incoloro.',
    reagents: ['hcl2', 'zn', 'mg', 'agua'],
    vessels: [{ kind: 'vaso', capacity: 50, x: 0.5, initial: [['cuo', 1]] }],
    tools: {},
    doses: [1, 5, 10, 25],
    goals: [
      { kind: 'solidMin', sp: 'CuS', grams: 0.6, label: 'Cobre metálico ≥ 0,60 g' },
      { kind: 'onlySolid', sp: 'CuS', label: 'Cobre solo: sin óxido ni otro metal' },
      { kind: 'aqMax', sp: 'Cu', conc: 1e-3, label: 'Líquido incoloro (sin Cu²⁺)' },
    ],
    par: 4,
    hints: [
      'Primero hay que pasar el cobre a la solución: los óxidos metálicos se disuelven en ácido.',
      'Un metal más reactivo saca al cobre de la solución… pero también reacciona con el ácido que sobre. Si queda metal de más, el ácido lo disuelve y al cobre no lo toca.',
      '10 mL de HCl 2 M, dos cucharadas de zinc (con una no alcanza para 10 mmol de cobre) y, cuando el líquido quede incoloro, otros 10 mL de HCl para disolver el zinc que sobró.',
    ],
    explain:
      '<p class="eq">CuO + 2 HCl → CuCl₂ + H₂O</p>' +
      '<p class="eq">CuCl₂ + Zn → ZnCl₂ + Cu(s)</p>' +
      '<p class="eq">Zn + 2 HCl → ZnCl₂ + H₂↑</p>' +
      '<p>El cobre pasó por tres formas sin perderse: óxido negro, ion celeste en solución y metal rojizo. El zinc lo <b>desplaza</b> porque es más reactivo; el ácido se lleva el zinc sobrante, pero no puede con el cobre, que está por debajo del hidrógeno en la serie de actividad.</p>',
  },
];
