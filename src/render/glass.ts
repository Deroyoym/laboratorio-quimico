import type { VesselKind } from '../chem/engine';

/**
 * Geometría del material de vidrio. Cada pieza es un sólido de revolución
 * descrito por su perfil: semiancho relativo en función de la altura t (0 en
 * el fondo, 1 en la boca). Con eso se dibuja el contorno y se calcula a qué
 * altura llega un volumen dado (en un erlenmeyer el nivel no sube parejo).
 */
export interface Shape {
  kind: VesselKind;
  /** Ancho y alto en píxeles a escala 1 */
  w: number;
  h: number;
  /** Altura relativa a la que llega la capacidad nominal */
  fillTop: number;
  profile: (t: number) => number;
  /** Volumen acumulado normalizado (1 = capacidad nominal) en t = i/N */
  cum: number[];
  /** Termómetro: desplazamiento horizontal arriba y abajo, en semianchos de la boca */
  thermo: [number, number] | null;
}

const N = 96;

function build(
  kind: VesselKind,
  w: number,
  h: number,
  fillTop: number,
  profile: (t: number) => number,
  thermo: [number, number] | null,
): Shape {
  const cum = [0];
  let acc = 0;
  for (let i = 1; i <= N; i++) {
    const p = profile((i - 0.5) / N);
    acc += p * p;
    cum.push(acc);
  }
  const ref = cum[Math.round(fillTop * N)];
  return { kind, w, h, fillTop, profile, cum: cum.map((c) => c / ref), thermo };
}

const round = (t: number, r: number): number => (t >= r ? 1 : Math.sqrt(1 - (1 - t / r) ** 2));

export const SHAPES: Record<VesselKind, Shape> = {
  vaso: build(
    'vaso',
    118,
    136,
    0.8,
    (t) => (t > 0.965 ? 1 + (t - 0.965) * 1.4 : 0.9 + 0.1 * round(t, 0.06)),
    [0.72, 0.3],
  ),
  erlenmeyer: build(
    'erlenmeyer',
    150,
    170,
    0.56,
    (t) => {
      if (t < 0.035) return 0.93 + 0.07 * round(t, 0.035);
      if (t < 0.66) return 1 - ((t - 0.035) / (0.66 - 0.035)) * 0.74;
      if (t > 0.95) return 0.26 + (t - 0.95) * 1.2;
      return 0.26;
    },
    [0.25, 0.3],
  ),
  tubo: build(
    'tubo',
    30,
    124,
    0.86,
    (t) => (t > 0.97 ? 1 + (t - 0.97) * 5 : round(t, 15 / 124)),
    null,
  ),
};

/** Semiancho en píxeles a la altura t. */
export function halfWidth(shape: Shape, t: number, scale: number): number {
  return shape.profile(Math.max(0, Math.min(1, t))) * (shape.w / 2) * scale;
}

/** Altura relativa que alcanza una fracción de la capacidad nominal. */
export function levelFor(shape: Shape, frac: number): number {
  if (frac <= 0) return 0;
  const cum = shape.cum;
  for (let i = 1; i <= N; i++) {
    if (cum[i] >= frac) {
      const t = (i - 1 + (frac - cum[i - 1]) / (cum[i] - cum[i - 1])) / N;
      return Math.min(t, 0.985);
    }
  }
  return 0.985;
}

/**
 * Traza el contorno (boca → fondo → boca). `inset` lo achica hacia adentro
 * para recortar el contenido por dentro del vidrio.
 */
export function tracePath(
  ctx: Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo'>,
  shape: Shape,
  cx: number,
  baseY: number,
  scale: number,
  inset = 0,
): void {
  const steps = 56;
  const h = shape.h * scale;
  const yOf = (t: number): number => Math.min(baseY - inset, baseY - t * h);
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const x = cx - Math.max(0, halfWidth(shape, t, scale) - inset);
    if (i === steps) ctx.moveTo(x, yOf(t));
    else ctx.lineTo(x, yOf(t));
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.lineTo(cx + Math.max(0, halfWidth(shape, t, scale) - inset), yOf(t));
  }
}
