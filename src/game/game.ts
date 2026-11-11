import {
  addReagent,
  createVessel,
  emptyVessel,
  step,
  type LabEvent,
  type Vessel,
} from '../chem/engine';
import { REAGENTS, type ReagentDef } from '../chem/reagents';
import { SPECIES } from '../chem/species';
import { evalAll, fmt, type CondResult } from './goals';
import type { LevelDef } from './levels';

export interface Point {
  x: number;
  y: number;
}

/** Animación de vertido en curso. La escena la dibuja; acá se dosifica. */
export interface Pour {
  reagent: number;
  vessel: number;
  phase: 'go' | 'pour' | 'back';
  /** Tiempo dentro de la fase actual */
  t: number;
  /** Duración del chorro */
  dur: number;
  /** mL o dosis a agregar en total */
  total: number;
  done: number;
  /** Desde dónde sale el envase (si se soltó arrastrando) */
  from: Point | null;
}

export const GO_TIME = 0.34;
export const BACK_TIME = 0.3;

export interface GameHooks {
  toast(text: string, tone?: 'info' | 'warn'): void;
  /** Cambió algo que muestra la interfaz (selección, dosis, mechero…) */
  changed(): void;
  won(stars: number): void;
}

export class Game {
  readonly level: LevelDef;
  readonly reagents: ReagentDef[];
  vessels: Vessel[] = [];
  dose: number;
  selReagent: number | null = null;
  selVessel = 0;
  pour: Pour | null = null;
  private queue: { reagent: number; vessel: number; from: Point | null }[] = [];
  actions = 0;
  time = 0;
  won = false;
  private winHold = 0;
  private brokenWarned = false;
  private hooks: GameHooks;

  constructor(level: LevelDef, hooks: GameHooks) {
    this.level = level;
    this.hooks = hooks;
    this.reagents = level.reagents.map((id) => REAGENTS[id]);
    this.dose = level.doses.includes(10) ? 10 : level.doses[0];
    this.setup();
  }

  private setup(): void {
    this.vessels = this.level.vessels.map((spec) => {
      const v = createVessel(spec.kind, spec.capacity);
      for (const [id, amount] of spec.initial ?? []) addReagent(v, REAGENTS[id], amount);
      // Deja el contenido inicial ya equilibrado
      step(v, 1e-3);
      return v;
    });
  }

  reset(): void {
    this.setup();
    this.selReagent = null;
    this.selVessel = 0;
    this.pour = null;
    this.queue = [];
    this.actions = 0;
    this.won = false;
    this.winHold = 0;
    this.brokenWarned = false;
    this.hooks.changed();
  }

  // --- Acciones del jugador ---------------------------------------------------

  setDose(ml: number): void {
    this.dose = ml;
    this.hooks.changed();
  }

  selectReagent(i: number | null): void {
    if (this.won) return;
    this.selReagent = i;
    this.hooks.changed();
  }

  tapReagent(i: number): void {
    this.selectReagent(this.selReagent === i ? null : i);
  }

  tapVessel(i: number): void {
    if (this.won) return;
    this.selVessel = i;
    if (this.selReagent !== null) this.requestPour(this.selReagent, i, null);
    this.hooks.changed();
  }

  /** Pide verter una dosis del reactivo en el recipiente. */
  requestPour(reagent: number, vessel: number, from: Point | null): void {
    if (this.won) return;
    this.selVessel = vessel;
    if (this.queue.length < 3) this.queue.push({ reagent, vessel, from });
    this.hooks.changed();
  }

  private startPour(reagent: number, vessel: number, from: Point | null): void {
    const r = this.reagents[reagent];
    const v = this.vessels[vessel];
    let total: number;
    let dur: number;
    if (r.kind === 'solid') {
      total = 1;
      dur = 0.6;
    } else if (r.kind === 'dropper') {
      total = r.doseMl ?? 0.15;
      dur = 0.75;
    } else {
      total = this.dose;
      dur = 0.45 + 0.035 * total;
      if (v.vol >= v.capacity - 1e-6) {
        this.hooks.toast('El recipiente está lleno. Vacialo para seguir.', 'warn');
        return;
      }
    }
    this.pour = { reagent, vessel, phase: 'go', t: 0, dur, total, done: 0, from };
    this.actions++;
    this.hooks.changed();
  }

  emptySelected(): void {
    if (this.won) return;
    const v = this.vessels[this.selVessel];
    if (this.pour && this.pour.vessel === this.selVessel) return;
    const hadStuff = v.vol > 0 || Object.values(v.n).some((x) => x > 0);
    if (!hadStuff) return;
    emptyVessel(v);
    this.actions++;
    this.hooks.toast('Recipiente vaciado y enjuagado.');
    this.hooks.changed();
  }

  toggleBurner(): void {
    if (this.won || !this.level.tools.burner) return;
    const v = this.vessels[this.selVessel];
    if (!v.heating && v.vol < 5) {
      this.hooks.toast('Poné al menos 5 mL de líquido antes de encender el mechero.', 'warn');
      return;
    }
    v.heating = !v.heating;
    this.hooks.changed();
  }

  // --- Simulación -------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    const events: LabEvent[] = [];

    if (!this.pour && this.queue.length && !this.won) {
      const next = this.queue.shift()!;
      this.startPour(next.reagent, next.vessel, next.from);
    }
    if (this.pour) this.advancePour(this.pour, dt, events);

    const sub = 2;
    for (const v of this.vessels) {
      for (let i = 0; i < sub; i++) step(v, dt / sub, events);
      if (v.heating && v.vol < 3) {
        v.heating = false;
        this.hooks.toast('¡Casi se seca! Apagué el mechero.', 'warn');
        this.hooks.changed();
      }
    }

    for (const e of events) this.announce(e);

    if (!this.won) {
      const res = this.results();
      const broken = res.conds.some((c) => c.broken);
      if (broken && !this.brokenWarned) {
        this.hooks.toast('Se rompió una condición del objetivo: vaciá el recipiente y probá de nuevo.', 'warn');
      }
      this.brokenWarned = broken;
      const allOk = res.conds.every((c) => c.ok);
      if (allOk && !this.pour && this.queue.length === 0) {
        this.winHold += dt;
        if (this.winHold > 1.1) {
          this.won = true;
          this.selReagent = null;
          for (const v of this.vessels) v.heating = false;
          this.hooks.changed();
          this.hooks.won(this.stars());
        }
      } else {
        this.winHold = 0;
      }
    }
  }

  private advancePour(p: Pour, dt: number, events: LabEvent[]): void {
    p.t += dt;
    if (p.phase === 'go') {
      if (p.t >= GO_TIME) {
        p.phase = 'pour';
        p.t = 0;
      }
      return;
    }
    if (p.phase === 'pour') {
      const frac = Math.min(1, p.t / p.dur);
      const delta = p.total * frac - p.done;
      const v = this.vessels[p.vessel];
      const added = addReagent(v, this.reagents[p.reagent], delta, events);
      p.done += delta;
      if (added < delta - 1e-9 || frac >= 1) {
        p.phase = 'back';
        p.t = 0;
      }
      return;
    }
    if (p.t >= BACK_TIME) this.pour = null;
  }

  private announce(e: LabEvent): void {
    switch (e.kind) {
      case 'solid':
      case 'gas': {
        const obs = SPECIES[e.sp].obs;
        if (obs) this.hooks.toast(obs);
        break;
      }
      case 'overflow':
        this.queue = [];
        this.hooks.toast('¡Se rebalsó! El recipiente está lleno.', 'warn');
        break;
      case 'boil':
        this.hooks.toast('¡Está hirviendo! El agua se evapora.', 'warn');
        break;
    }
  }

  // --- Objetivos --------------------------------------------------------------

  /** Estado de los objetivos en el recipiente que más cerca está de cumplirlos. */
  results(): { vessel: number; conds: CondResult[] } {
    const showPh = !!this.level.tools.phMeter;
    let best = -1;
    let bestConds: CondResult[] = [];
    let bestScore = -1;
    this.vessels.forEach((v, i) => {
      const conds = evalAll(this.level.goals, v, showPh);
      const score = conds.filter((c) => c.ok).length + (i === this.selVessel ? 0.5 : 0);
      if (score > bestScore) {
        best = i;
        bestConds = conds;
        bestScore = score;
      }
    });
    return { vessel: best, conds: bestConds };
  }

  stars(): number {
    if (this.actions <= this.level.par) return 3;
    if (this.actions <= this.level.par + 3) return 2;
    return 1;
  }

  /** Texto de la dosis que se va a verter con el reactivo elegido. */
  doseText(r: ReagentDef): string {
    if (r.kind === 'liquid') return `${fmt(this.dose, 0)} mL`;
    return r.doseLabel ?? '';
  }
}
