/**
 * Medidor de tiempos por cuadro. Guarda los últimos cuadros en un anillo y
 * calcula promedio y percentil 95 de cada etapa, para comparar antes y
 * después de un cambio en vez de optimizar a ojo.
 */
const SIZE = 600;

export type Stage = 'frame' | 'sim' | 'fx' | 'draw' | 'ui';
const STAGES: Stage[] = ['frame', 'sim', 'fx', 'draw', 'ui'];

export interface StageStats {
  avg: number;
  p95: number;
  max: number;
}

export class PerfProbe {
  private data: Record<Stage, Float32Array>;
  private index = 0;
  private count = 0;

  constructor() {
    this.data = Object.fromEntries(STAGES.map((s) => [s, new Float32Array(SIZE)])) as Record<
      Stage,
      Float32Array
    >;
  }

  /** Registra un cuadro: intervalo entre cuadros y milisegundos de cada etapa. */
  record(frame: number, sim: number, fx: number, draw: number, ui: number): void {
    const i = this.index;
    this.data.frame[i] = frame;
    this.data.sim[i] = sim;
    this.data.fx[i] = fx;
    this.data.draw[i] = draw;
    this.data.ui[i] = ui;
    this.index = (i + 1) % SIZE;
    if (this.count < SIZE) this.count++;
  }

  reset(): void {
    this.index = 0;
    this.count = 0;
  }

  report(): { frames: number; fps: number } & Record<Stage, StageStats> {
    const n = this.count;
    const out = { frames: n, fps: 0 } as { frames: number; fps: number } & Record<Stage, StageStats>;
    for (const s of STAGES) {
      const values = Array.from(this.data[s].subarray(0, n)).sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      out[s] = {
        avg: n ? sum / n : 0,
        p95: n ? values[Math.min(n - 1, Math.floor(n * 0.95))] : 0,
        max: n ? values[n - 1] : 0,
      };
    }
    out.fps = out.frame.avg > 0 ? 1000 / out.frame.avg : 0;
    return out;
  }
}
