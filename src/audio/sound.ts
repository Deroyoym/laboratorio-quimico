/**
 * Sonido del laboratorio, sintetizado con Web Audio: no hay archivos de audio.
 *
 * Hay dos clases de sonido:
 *  - Puntuales (`play`): toques, gotas, avisos, la melodía de victoria.
 *  - De ambiente (`ambience`): chorro, burbujeo, hervor y mechero. Son ruido
 *    filtrado que suena en bucle y al que solo se le sube o baja el volumen,
 *    más pequeños "blips" de burbujas disparados al azar.
 *
 * Los navegadores solo dejan sonar después de un gesto del usuario, por eso
 * el contexto se crea en `unlock`.
 */

export type SoundName =
  | 'tap'
  | 'select'
  | 'clink'
  | 'drop'
  | 'solid'
  | 'empty'
  | 'burnerOn'
  | 'burnerOff'
  | 'observe'
  | 'goal'
  | 'warn'
  | 'win';

/** Intensidad (0–1) de cada sonido de ambiente */
export interface Ambience {
  pour: number;
  fizz: number;
  boil: number;
  burner: number;
}

type Bed = keyof Ambience;

const BED_GAIN: Record<Bed, number> = { pour: 0.15, fizz: 0.06, boil: 0.2, burner: 0.07 };
const SILENCE: Ambience = { pour: 0, fizz: 0, boil: 0, burner: 0 };

export class Sound {
  enabled: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beds: Record<Bed, GainNode> | null = null;
  private level: Ambience = { ...SILENCE };
  private blipAcc = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
  }

  /** Crea o reanuda el contexto de audio. Hay que llamarlo desde un gesto del usuario. */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.unlock();
    else if (this.ctx) void this.ctx.suspend();
  }

  private build(): void {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    this.master = master;

    // Dos segundos de ruido blanco, base de todos los sonidos "de líquido"
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const bed = (type: BiquadFilterType, freq: number, q: number): GainNode => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      return gain;
    };
    this.beds = {
      pour: bed('bandpass', 1500, 0.7),
      fizz: bed('highpass', 5200, 0.5),
      boil: bed('lowpass', 260, 0.8),
      burner: bed('bandpass', 520, 0.5),
    };
    source.start();
  }

  /** Fija el volumen de los sonidos de ambiente. */
  ambience(a: Ambience): void {
    this.level = a;
    if (!this.ctx || !this.beds) return;
    const now = this.ctx.currentTime;
    for (const k of Object.keys(BED_GAIN) as Bed[]) {
      const target = this.enabled ? Math.max(0, Math.min(1, a[k])) * BED_GAIN[k] : 0;
      this.beds[k].gain.setTargetAtTime(target, now, 0.07);
    }
  }

  silence(): void {
    this.ambience(SILENCE);
  }

  /** Dispara los "blips" de burbujas que acompañan al ambiente. */
  update(dt: number): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const { pour, fizz, boil } = this.level;
    const rates = [pour * 9, fizz * 22, boil * 16];
    const total = rates[0] + rates[1] + rates[2];
    if (total <= 0) {
      this.blipAcc = 0;
      return;
    }
    this.blipAcc += total * dt;
    let budget = 4;
    while (this.blipAcc >= 1 && budget-- > 0) {
      this.blipAcc -= 1;
      const pick = Math.random() * total;
      const now = this.ctx.currentTime + Math.random() * 0.03;
      if (pick < rates[0]) this.blip(now, 320 + Math.random() * 520, 0.05);
      else if (pick < rates[0] + rates[1]) this.blip(now, 900 + Math.random() * 1600, 0.035);
      else this.blip(now, 150 + Math.random() * 260, 0.07);
    }
    if (this.blipAcc > 4) this.blipAcc = 0;
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'tap':
        this.tone(t, 540, 0.05, 0.04, 'triangle');
        break;
      case 'select':
        this.tone(t, 1760, 0.2, 0.045);
        this.tone(t, 2640, 0.14, 0.02);
        break;
      case 'clink':
        this.tone(t, 1320, 0.12, 0.03);
        this.tone(t, 1985, 0.08, 0.015);
        break;
      case 'drop':
        for (let i = 0; i < 3; i++) this.blip(t + 0.2 + i * 0.2, 620 + i * 60, 0.09);
        break;
      case 'solid':
        for (let i = 0; i < 9; i++) {
          this.burst(t + 0.05 + i * 0.045 + Math.random() * 0.02, 0.03, 0.07, 'bandpass', 2200 + Math.random() * 1400);
        }
        break;
      case 'empty':
        this.burst(t, 0.7, 0.2, 'lowpass', 1100, 180);
        this.blip(t + 0.35, 240, 0.08);
        this.blip(t + 0.5, 190, 0.08);
        break;
      case 'burnerOn':
        this.burst(t, 0.3, 0.14, 'bandpass', 320, 950);
        break;
      case 'burnerOff':
        this.burst(t, 0.2, 0.09, 'lowpass', 800, 140);
        break;
      case 'observe':
        this.tone(t, 880, 0.22, 0.045);
        this.tone(t + 0.1, 1318.5, 0.3, 0.045);
        break;
      case 'goal':
        this.tone(t, 1046.5, 0.12, 0.04);
        this.tone(t + 0.07, 1568, 0.2, 0.04);
        break;
      case 'warn':
        this.tone(t, 207.65, 0.14, 0.07, 'triangle');
        this.tone(t + 0.13, 155.56, 0.2, 0.07, 'triangle');
        break;
      case 'win': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => this.tone(t + i * 0.11, f, 0.5, 0.07, 'triangle'));
        this.tone(t + 0.44, 2093, 0.7, 0.025);
        this.tone(t + 0.44, 1568, 0.7, 0.03);
        break;
      }
    }
  }

  /** Nota con ataque rápido y caída exponencial. */
  private tone(t: number, freq: number, dur: number, peak: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => gain.disconnect();
  }

  /** Burbuja o gota: un tono corto que sube de frecuencia. */
  private blip(t: number, freq: number, peak: number): void {
    const ctx = this.ctx!;
    const dur = 0.05 + Math.random() * 0.04;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.7, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => gain.disconnect();
  }

  /** Ráfaga de ruido filtrado; la frecuencia del filtro puede barrer de f0 a f1. */
  private burst(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1 = f0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + Math.min(0.03, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
    src.onended = () => gain.disconnect();
  }

  /** Estado interno, para pruebas automáticas. */
  debug(): { state: string; beds: Record<string, number> } {
    const beds: Record<string, number> = {};
    if (this.beds) for (const k of Object.keys(this.beds) as Bed[]) beds[k] = this.beds[k].gain.value;
    return { state: this.ctx ? this.ctx.state : 'sin contexto', beds };
  }
}
