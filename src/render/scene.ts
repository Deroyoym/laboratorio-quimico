import { liquidLook, sediment, type Vessel } from '../chem/engine';
import type { ReagentDef } from '../chem/reagents';
import { CHUNKS, POWDERS, type PieceKind, type RGB } from '../chem/species';
import { BACK_TIME, GO_TIME, type Game, type Point, type Pour } from '../game/game';
import { SHAPES, halfWidth, levelFor, tracePath, type Shape } from './glass';

interface BottleSlot {
  /** Centro horizontal y base (apoyo en el estante) */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface VesselSlot {
  cx: number;
  baseY: number;
  topY: number;
  scale: number;
  shape: Shape;
  /** Semiancho de la zona táctil */
  hitHalf: number;
}

interface Layout {
  bottles: BottleSlot[];
  vessels: VesselSlot[];
  slotW: number;
  shelfY: number;
  plankH: number;
  capBottom: number;
  benchY: number;
  surfaceY: number;
  tripod: number;
  s: number;
}

interface Bubble {
  u: number;
  t: number;
  r: number;
  vt: number;
  ph: number;
}
interface Flake {
  u: number;
  t: number;
  size: number;
  vt: number;
  ph: number;
  sp: string;
}
interface Steam {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  vx: number;
  vy: number;
}
interface Fx {
  bubbles: Bubble[];
  flakes: Flake[];
  steam: Steam[];
  bubAcc: number;
  steamAcc: number;
  dispTemp: number;
}

const TEAL = '#2fbfa6';
const OUTLINE = 'rgba(66,96,114,0.82)';

/** Moles de cada trozo de metal dibujado */
const PIECE_MOL: Record<string, number> = {
  Zn: 0.1 / 65.38,
  Mg: 0.05 / 24.305,
  CuM: 0.1 / 63.546,
};

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const hash = (x: number): number => {
  const s = Math.sin(x * 127.1 + 11.7) * 43758.5453;
  return s - Math.floor(s);
};
const rgba = (c: RGB, a = 1): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export class Scene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private game: Game;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private layout!: Layout;
  private bg: HTMLCanvasElement | null = null;
  private fx = new Map<Vessel, Fx>();
  private time = 0;

  /** Envase que se está arrastrando con el dedo */
  drag: { idx: number; x: number; y: number } | null = null;
  /** Envase volviendo solo al estante después de soltarlo en cualquier lado */
  private returning: { idx: number; from: Point; t: number } | null = null;

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.game = game;
    this.resize();
  }

  setGame(game: Game): void {
    this.game = game;
    this.fx.clear();
    this.drag = null;
    this.returning = null;
    this.bg = null;
    this.computeLayout();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(200, rect.width);
    this.H = Math.max(200, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.bg = null;
    this.computeLayout();
  }

  // --- Disposición ------------------------------------------------------------

  private computeLayout(): void {
    const { W, H, game } = this;
    const n = game.reagents.length;
    const slotW = Math.min(88, (W - 10) / n);
    const bw = Math.min(56, slotW * 0.72, H * 0.12);
    const bh = bw * 1.72;
    const shelfY = 20 + bh;
    const plankH = 9;
    const capBottom = shelfY + plankH + 30;
    const benchH = clamp(H * 0.14, 44, 84);
    const benchY = H - benchH;
    const surfaceY = benchY + Math.min(20, benchH * 0.34);

    const specs = game.level.vessels;
    const maxH = Math.max(...specs.map((v) => SHAPES[v.kind].h));
    const burner = !!game.level.tools.burner;
    const free = surfaceY - capBottom - 34;
    let s = clamp(free / (maxH + (burner ? 60 : 0)), 0.5, 1.5);
    // Que entren a lo ancho
    const widest = Math.max(...specs.map((v) => SHAPES[v.kind].w));
    s = Math.min(s, (W * 0.5) / widest);
    const tripod = burner ? 60 * s : 0;

    const bottles: BottleSlot[] = game.reagents.map((r, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * slotW;
      const [w, h] = bottleSize(r, bw, bh);
      return { x, y: shelfY, w, h };
    });

    const vessels: VesselSlot[] = specs.map((spec) => {
      const shape = SHAPES[spec.kind];
      const cx = spec.x * W;
      const baseY = surfaceY - tripod - (spec.kind === 'tubo' ? 7 * s : 0);
      return {
        cx,
        baseY,
        topY: baseY - shape.h * s,
        scale: s,
        shape,
        hitHalf: Math.max((shape.w * s) / 2 + 12, 30),
      };
    });

    this.layout = { bottles, vessels, slotW, shelfY, plankH, capBottom, benchY, surfaceY, tripod, s };
  }

  hitBottle(x: number, y: number): number {
    const L = this.layout;
    if (y > L.capBottom + 4) return -1;
    for (let i = 0; i < L.bottles.length; i++) {
      if (Math.abs(x - L.bottles[i].x) <= L.slotW / 2) return i;
    }
    return -1;
  }

  hitVessel(x: number, y: number): number {
    const L = this.layout;
    if (y < L.capBottom - 6) return -1;
    let best = -1;
    let bestD = Infinity;
    L.vessels.forEach((v, i) => {
      const d = Math.abs(x - v.cx);
      if (d <= v.hitHalf && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  bottleHeight(idx: number): number {
    return this.layout.bottles[idx].h;
  }

  /** El envase soltado vuelve animado a su lugar. */
  releaseBottle(idx: number, from: Point): void {
    this.returning = { idx, from, t: 0 };
  }

  // --- Partículas ------------------------------------------------------------

  private fxFor(v: Vessel): Fx {
    let f = this.fx.get(v);
    if (!f) {
      f = { bubbles: [], flakes: [], steam: [], bubAcc: 0, steamAcc: 0, dispTemp: v.temp };
      this.fx.set(v, f);
    }
    return f;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.returning) {
      this.returning.t += dt;
      if (this.returning.t >= 0.22) this.returning = null;
    }
    const { game, layout } = this;
    game.vessels.forEach((v, i) => {
      const slot = layout.vessels[i];
      const f = this.fxFor(v);
      const h = slot.shape.h * slot.scale;
      const lt = levelFor(slot.shape, v.vol / v.capacity);
      const sed = sediment(v);
      const st = Math.min(lt, sed.ml > 0 ? levelFor(slot.shape, sed.ml / v.capacity) : 0);
      f.dispTemp += (v.temp - f.dispTemp) * (1 - Math.exp(-dt / 0.45));

      // Burbujas: gas de reacción, ebullición y salpicado del chorro
      const pouringHere = game.pour && game.pour.vessel === i && game.pour.phase === 'pour';
      const liquidPour = pouringHere && game.reagents[game.pour!.reagent].kind === 'liquid';
      let rate = Math.min(110, v.gasRate * 5e4) + (v.boiling ? 46 : 0) + (liquidPour ? 16 : 0);
      if (lt < 0.03) rate = 0;
      f.bubAcc += rate * dt;
      const emitters = v.gasRate > 1e-6 ? this.chunkSpots(v, slot, st, true) : [];
      while (f.bubAcc >= 1) {
        f.bubAcc -= 1;
        if (f.bubbles.length > 170) continue;
        const big = v.boiling && Math.random() < 0.4;
        let u = (Math.random() * 2 - 1) * 0.86;
        let t = st + 0.01;
        if (emitters.length && Math.random() < 0.85) {
          const e = emitters[Math.floor(Math.random() * emitters.length)];
          u = clamp(e.u + (Math.random() - 0.5) * 0.12, -0.9, 0.9);
          t = e.t;
        } else if (liquidPour && !v.boiling && v.gasRate < 1e-6) {
          u = (Math.random() - 0.5) * 0.3;
          t = lerp(st, lt, 0.5 + Math.random() * 0.45);
        }
        f.bubbles.push({
          u,
          t,
          r: (big ? 3 + Math.random() * 3 : 1 + Math.random() * 2.2) * slot.scale,
          vt: (big ? 150 : 70 + Math.random() * 70) / Math.max(40, h),
          ph: Math.random() * 6.28,
        });
      }
      for (let k = f.bubbles.length - 1; k >= 0; k--) {
        const b = f.bubbles[k];
        b.t += b.vt * dt * slot.scale;
        b.u = clamp(b.u + Math.sin(this.time * 9 + b.ph) * 0.5 * dt, -0.92, 0.92);
        if (b.t >= lt - 0.012) f.bubbles.splice(k, 1);
      }

      // Copos de precipitado en suspensión
      const counts: Record<string, number> = {};
      for (let k = f.flakes.length - 1; k >= 0; k--) {
        const fl = f.flakes[k];
        fl.t -= fl.vt * dt;
        fl.u = clamp(fl.u + Math.sin(this.time * 2.3 + fl.ph) * 0.12 * dt, -0.9, 0.9);
        if (v.boiling) fl.t += Math.sin(this.time * 5 + fl.ph * 3) * 0.5 * dt;
        if (fl.t > lt - 0.02) fl.t = lt - 0.02;
        if (fl.t <= st + 0.005 || lt < 0.03) {
          f.flakes.splice(k, 1);
          continue;
        }
        counts[fl.sp] = (counts[fl.sp] ?? 0) + 1;
      }
      if (lt > 0.04) {
        for (const sp of POWDERS) {
          const su = v.susp[sp.id] ?? 0;
          if (su <= 0) continue;
          const target = Math.min(64, Math.round(su * 3.2e4));
          let have = counts[sp.id] ?? 0;
          for (let add = 0; add < 4 && have < target; add++, have++) {
            f.flakes.push({
              u: (Math.random() * 2 - 1) * 0.88,
              t: lerp(st + 0.01, lt - 0.02, Math.random()),
              size: (1.1 + Math.random() * 1.7) * slot.scale,
              vt: 0.035 + Math.random() * 0.06,
              ph: Math.random() * 6.28,
              sp: sp.id,
            });
          }
        }
      }

      // Vapor
      const hot = v.vol > 0.5 ? clamp((v.temp - 52) / 45, 0, 1) : 0;
      f.steamAcc += hot * 15 * dt;
      const mouth = halfWidth(slot.shape, 1, slot.scale);
      while (f.steamAcc >= 1) {
        f.steamAcc -= 1;
        if (f.steam.length > 50) continue;
        f.steam.push({
          x: slot.cx + (Math.random() - 0.5) * mouth * 1.2,
          y: slot.topY + 4,
          r: 4 + Math.random() * 5,
          life: 0,
          max: 1.3 + Math.random() * 0.9,
          vx: (Math.random() - 0.5) * 10,
          vy: -(20 + Math.random() * 22),
        });
      }
      for (let k = f.steam.length - 1; k >= 0; k--) {
        const p = f.steam[k];
        p.life += dt;
        p.x += (p.vx + Math.sin(this.time * 2 + p.y * 0.05) * 6) * dt;
        p.y += p.vy * dt;
        p.r += 7 * dt;
        if (p.life >= p.max) f.steam.splice(k, 1);
      }
    });
  }

  /** Posición de cada trozo de metal en el fondo (u, t) con su tamaño relativo. */
  private chunkSpots(
    v: Vessel,
    slot: VesselSlot,
    st: number,
    reactiveOnly = false,
  ): { u: number; t: number; size: number; sp: string; k: number }[] {
    const out: { u: number; t: number; size: number; sp: string; k: number }[] = [];
    const hPx = slot.shape.h * slot.scale;
    CHUNKS.forEach((sp, si) => {
      if (reactiveOnly && sp.id === 'CuM') return;
      const n = v.n[sp.id] ?? 0;
      if (n <= 0) return;
      const count = n / PIECE_MOL[sp.id];
      const full = Math.min(42, Math.ceil(count - 1e-9));
      for (let k = 0; k < full; k++) {
        const rest = count - k;
        const size = rest >= 1 ? 1 : Math.cbrt(Math.max(0.02, rest));
        const u = (hash(k * 7.31 + si * 53.9) * 2 - 1) * 0.78;
        const t = st + (5 * slot.scale + hash(k * 3.17 + si * 19.3) * 7 * slot.scale) / hPx;
        out.push({ u, t, size, sp: sp.id, k });
      }
    });
    return out;
  }

  // --- Dibujo -----------------------------------------------------------------

  draw(): void {
    const { ctx, W, H, game, layout: L } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.bg) this.bg = this.renderBackground();
    ctx.drawImage(this.bg, 0, 0, W, H);

    const pour = game.pour;
    const activeIdx = pour ? pour.reagent : this.drag ? this.drag.idx : this.returning ? this.returning.idx : -1;

    // Estantería
    game.reagents.forEach((r, i) => {
      const b = L.bottles[i];
      const selected = game.selReagent === i;
      this.drawCaption(r, b, selected);
      if (i === activeIdx) return;
      const lift = selected ? 7 + Math.sin(this.time * 4) * 1.5 : 0;
      if (selected) this.drawGlow(b.x, b.y - b.h / 2 - lift, b.h * 0.72);
      drawBottle(ctx, r, b.x, b.y - b.h / 2 - lift, b.w, b.h, 0, false);
    });

    this.drawRack();
    const openVessels = game.vessels.filter((_, i) => !game.isLocked(i)).length;
    game.vessels.forEach((v, i) => {
      const slot = L.vessels[i];
      if (game.level.tools.burner) this.drawBurner(slot, v);
      if (openVessels > 1 && game.selVessel === i) this.drawSelection(slot);
      this.drawVessel(slot, v);
      if (game.isLocked(i)) this.drawStopper(slot, game.level.vessels[i].tag);
    });

    // Flechas que invitan a verter
    const dragOver = this.drag ? this.hitVessel(this.drag.x, this.drag.y) : -1;
    if (!game.won && !pour && (game.selReagent !== null || this.drag)) {
      L.vessels.forEach((slot, i) => {
        if (!game.isLocked(i)) this.drawChevron(slot, i === dragOver);
      });
    }

    // Envase en movimiento
    if (pour) this.drawPour(pour);
    else if (this.drag) {
      const r = game.reagents[this.drag.idx];
      const b = L.bottles[this.drag.idx];
      const y = this.drag.y - b.h * 0.75;
      this.drawGlow(this.drag.x, y, b.h * 0.7);
      drawBottle(ctx, r, this.drag.x, y, b.w, b.h, 0, false);
    } else if (this.returning) {
      const b = L.bottles[this.returning.idx];
      const u = ease(this.returning.t / 0.22);
      drawBottle(
        ctx,
        game.reagents[this.returning.idx],
        lerp(this.returning.from.x, b.x, u),
        lerp(this.returning.from.y, b.y - b.h / 2, u),
        b.w,
        b.h,
        0,
        false,
      );
    }
  }

  private renderBackground(): HTMLCanvasElement {
    const { W, H, dpr, layout: L } = this;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Pared de azulejos
    const wall = ctx.createLinearGradient(0, 0, 0, L.benchY);
    wall.addColorStop(0, '#eef3f4');
    wall.addColorStop(1, '#d9e3e6');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, L.benchY);
    const tile = clamp(W / 7, 44, 64);
    ctx.lineWidth = 1;
    for (let x = (W % tile) / 2; x < W; x += tile) {
      ctx.strokeStyle = 'rgba(120,145,155,0.16)';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, L.benchY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(x + 1.5, 0);
      ctx.lineTo(x + 1.5, L.benchY);
      ctx.stroke();
    }
    for (let y = L.benchY - tile; y > -tile; y -= tile) {
      ctx.strokeStyle = 'rgba(120,145,155,0.16)';
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(0, y + 1.5);
      ctx.lineTo(W, y + 1.5);
      ctx.stroke();
    }
    // Luz desde arriba
    const light = ctx.createRadialGradient(W * 0.5, L.shelfY + 60, 20, W * 0.5, L.shelfY + 60, Math.max(W, H) * 0.75);
    light.addColorStop(0, 'rgba(255,255,255,0.35)');
    light.addColorStop(1, 'rgba(120,140,150,0.16)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, L.benchY);

    // Estante
    const sy = L.shelfY;
    const shadow = ctx.createLinearGradient(0, sy + L.plankH, 0, sy + L.plankH + 16);
    shadow.addColorStop(0, 'rgba(40,60,70,0.22)');
    shadow.addColorStop(1, 'rgba(40,60,70,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(6, sy + L.plankH, W - 12, 16);
    const wood = ctx.createLinearGradient(0, sy, 0, sy + L.plankH);
    wood.addColorStop(0, '#d7b98c');
    wood.addColorStop(0.35, '#c29a66');
    wood.addColorStop(1, '#9c7645');
    ctx.fillStyle = wood;
    roundRect(ctx, 4, sy, W - 8, L.plankH, 2.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(6, sy + 0.5, W - 12, 1);

    // Mesada
    const top = ctx.createLinearGradient(0, L.benchY, 0, L.surfaceY + 14);
    top.addColorStop(0, '#59646c');
    top.addColorStop(1, '#3b444b');
    ctx.fillStyle = top;
    ctx.fillRect(0, L.benchY, W, L.surfaceY + 14 - L.benchY);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, L.benchY, W, 1.5);
    const front = ctx.createLinearGradient(0, L.surfaceY + 14, 0, H);
    front.addColorStop(0, '#2a3238');
    front.addColorStop(0.12, '#20272c');
    front.addColorStop(1, '#161b1f');
    ctx.fillStyle = front;
    ctx.fillRect(0, L.surfaceY + 14, W, H - L.surfaceY - 14);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, L.surfaceY + 14, W, 1);
    // Sombra de la pared sobre la mesada
    const wallShadow = ctx.createLinearGradient(0, L.benchY - 12, 0, L.benchY);
    wallShadow.addColorStop(0, 'rgba(60,80,90,0)');
    wallShadow.addColorStop(1, 'rgba(60,80,90,0.2)');
    ctx.fillStyle = wallShadow;
    ctx.fillRect(0, L.benchY - 12, W, 12);
    return c;
  }

  private drawCaption(r: ReagentDef, b: BottleSlot, selected: boolean): void {
    const { ctx, layout: L } = this;
    const size = clamp(L.slotW * 0.15, 9, 11.5);
    ctx.font = `${selected ? 700 : 600} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = selected ? '#0f8f7a' : '#4a5d68';
    const y = L.shelfY + L.plankH + size + 3;
    ctx.fillText(r.caption[0], b.x, y);
    if (r.caption[1]) ctx.fillText(r.caption[1], b.x, y + size + 1.5);
  }

  private drawGlow(x: number, y: number, radius: number): void {
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    g.addColorStop(0, 'rgba(47,191,166,0.42)');
    g.addColorStop(1, 'rgba(47,191,166,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSelection(slot: VesselSlot): void {
    const { ctx, layout: L } = this;
    const rx = (slot.shape.w * slot.scale) / 2 + 12;
    ctx.save();
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.75 + Math.sin(this.time * 4) * 0.2;
    ctx.beginPath();
    ctx.ellipse(slot.cx, L.surfaceY + 2, rx, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Tapón y cartel de un recipiente de referencia. */
  private drawStopper(slot: VesselSlot, tag?: string): void {
    const { ctx } = this;
    const s = slot.scale;
    const mouth = halfWidth(slot.shape, 0.96, s);
    const y = slot.topY;
    const cork = ctx.createLinearGradient(slot.cx - mouth, 0, slot.cx + mouth, 0);
    cork.addColorStop(0, '#9a6d3f');
    cork.addColorStop(0.45, '#c79a63');
    cork.addColorStop(1, '#85592f');
    ctx.fillStyle = cork;
    ctx.strokeStyle = 'rgba(70,45,20,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(slot.cx - mouth * 1.12, y - 8 * s);
    ctx.lineTo(slot.cx + mouth * 1.12, y - 8 * s);
    ctx.lineTo(slot.cx + mouth * 0.86, y + 7 * s);
    ctx.lineTo(slot.cx - mouth * 0.86, y + 7 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!tag) return;
    const size = clamp(10 * s, 9, 12);
    ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const text = tag.toUpperCase();
    const tw = ctx.measureText(text).width + 12;
    const ty = y - 8 * s - size - 12;
    ctx.fillStyle = 'rgba(18,34,44,0.9)';
    roundRect(ctx, slot.cx - tw / 2, ty, tw, size + 8, 5);
    ctx.fill();
    ctx.fillStyle = '#e9f2f4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, slot.cx, ty + (size + 8) / 2 + 0.5);
  }

  private drawChevron(slot: VesselSlot, strong: boolean): void {
    const { ctx } = this;
    const size = (strong ? 9 : 7) * clamp(slot.scale, 0.8, 1.2);
    const y = slot.topY - 12 - size + Math.sin(this.time * 5) * 3;
    ctx.save();
    ctx.globalAlpha = strong ? 1 : 0.8;
    ctx.fillStyle = TEAL;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(slot.cx - size, y - size * 0.6);
    ctx.lineTo(slot.cx + size, y - size * 0.6);
    ctx.lineTo(slot.cx, y + size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Gradilla de madera para los tubos de ensayo. */
  private drawRack(): void {
    const { ctx, layout: L } = this;
    const tubes = L.vessels.filter((v) => v.shape.kind === 'tubo');
    if (!tubes.length) return;
    const s = L.s;
    const x0 = Math.min(...tubes.map((t) => t.cx)) - 26 * s;
    const x1 = Math.max(...tubes.map((t) => t.cx)) + 26 * s;
    const h = tubes[0].shape.h * s;
    const barY = tubes[0].baseY - h * 0.58;
    ctx.fillStyle = '#8d6a40';
    ctx.fillRect(x0 + 2 * s, barY, 5 * s, L.surfaceY - barY);
    ctx.fillRect(x1 - 7 * s, barY, 5 * s, L.surfaceY - barY);
    const wood = ctx.createLinearGradient(0, barY, 0, barY + 9 * s);
    wood.addColorStop(0, '#d2ae7c');
    wood.addColorStop(1, '#a9824f');
    ctx.fillStyle = wood;
    roundRect(ctx, x0, barY, x1 - x0, 9 * s, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse((x0 + x1) / 2, L.surfaceY + 3, (x1 - x0) / 2 + 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const base = ctx.createLinearGradient(0, L.surfaceY - 9 * s, 0, L.surfaceY + 2);
    base.addColorStop(0, '#c9a36f');
    base.addColorStop(1, '#94703f');
    ctx.fillStyle = base;
    roundRect(ctx, x0 - 3 * s, L.surfaceY - 9 * s, x1 - x0 + 6 * s, 11 * s, 2.5);
    ctx.fill();
  }

  private drawBurner(slot: VesselSlot, v: Vessel): void {
    const { ctx, layout: L } = this;
    const s = slot.scale;
    const { cx, baseY } = slot;
    const floor = L.surfaceY;
    const half = (slot.shape.w * s) / 2 + 12 * s;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, floor + 3, half + 16 * s, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Patas del trípode
    ctx.strokeStyle = '#5a646b';
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - half + 4 * s, baseY + 2);
    ctx.lineTo(cx - half - 10 * s, floor);
    ctx.moveTo(cx + half - 4 * s, baseY + 2);
    ctx.lineTo(cx + half + 10 * s, floor);
    ctx.stroke();

    // Mechero Bunsen
    const tubeTop = floor - L.tripod * 0.56;
    ctx.fillStyle = '#3e474d';
    roundRect(ctx, cx - 19 * s, floor - 7 * s, 38 * s, 9 * s, 3 * s);
    ctx.fill();
    const tube = ctx.createLinearGradient(cx - 5 * s, 0, cx + 5 * s, 0);
    tube.addColorStop(0, '#7c8891');
    tube.addColorStop(0.45, '#c3ccd2');
    tube.addColorStop(1, '#6c7780');
    ctx.fillStyle = tube;
    ctx.fillRect(cx - 4.5 * s, tubeTop, 9 * s, floor - 7 * s - tubeTop);
    ctx.fillStyle = '#4b555c';
    ctx.fillRect(cx - 6.5 * s, floor - 17 * s, 13 * s, 6 * s);

    if (v.heating) {
      const flick = 1 + Math.sin(this.time * 31) * 0.05 + Math.sin(this.time * 17.3) * 0.05;
      const fh = (tubeTop - baseY - 1) * flick + 5 * s;
      const flame = (w: number, hgt: number, color: string): void => {
        const yb = tubeTop + 1;
        const yt = yb - hgt;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx, yt);
        ctx.bezierCurveTo(cx + w, yt + hgt * 0.5, cx + w * 0.8, yb, cx, yb);
        ctx.bezierCurveTo(cx - w * 0.8, yb, cx - w, yt + hgt * 0.5, cx, yt);
        ctx.fill();
      };
      const glow = ctx.createRadialGradient(cx, tubeTop - fh * 0.5, 2, cx, tubeTop - fh * 0.5, 34 * s);
      glow.addColorStop(0, 'rgba(90,170,255,0.35)');
      glow.addColorStop(1, 'rgba(90,170,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 40 * s, tubeTop - 50 * s, 80 * s, 70 * s);
      flame(11 * s, fh, 'rgba(46,120,255,0.55)');
      flame(7.5 * s, fh * 0.8, 'rgba(96,176,255,0.75)');
      flame(4 * s, fh * 0.5, 'rgba(210,238,255,0.95)');
    }

    // Rejilla
    const hot = v.heating ? 1 : 0;
    ctx.fillStyle = hot ? '#b9774d' : '#7d878e';
    roundRect(ctx, cx - half, baseY, half * 2, 3.2 * s, 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(cx - half + 2, baseY, half * 2 - 4, 1);
  }

  private drawVessel(slot: VesselSlot, v: Vessel): void {
    const { ctx, layout: L } = this;
    const { shape, cx, baseY, scale: s, topY } = slot;
    const h = shape.h * s;
    const f = this.fxFor(v);
    const look = liquidLook(v);
    const lt = levelFor(shape, v.vol / v.capacity);
    const yL = baseY - lt * h;
    const sed = sediment(v);
    const stRaw = sed.ml > 0 ? levelFor(shape, sed.ml / v.capacity) : 0;
    const st = lt > 0 ? Math.min(stRaw, lt * 0.9) : stRaw;
    const maxHW = (shape.w * s) / 2;

    // Sombra sobre la mesada (o la rejilla)
    if (shape.kind !== 'tubo' && !this.game.level.tools.burner) {
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(cx, L.surfaceY + 3, maxHW + 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vidrio de fondo
    ctx.beginPath();
    tracePath(ctx, shape, cx, baseY, s);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244,250,253,0.34)';
    ctx.fill();

    if (shape.thermo) this.drawThermometer(slot, f.dispTemp);

    // Contenido, recortado por dentro del vidrio
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, shape, cx, baseY, s, 1.7);
    ctx.closePath();
    ctx.clip();

    // Sedimento
    if (st > 0) {
      const yS = baseY - st * h;
      const body = ctx.createLinearGradient(0, yS, 0, baseY);
      body.addColorStop(0, rgba(sed.rgb));
      body.addColorStop(1, rgba(mix(sed.rgb, [0, 0, 0], 0.22)));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(cx - maxHW, baseY + 2);
      ctx.lineTo(cx - maxHW, yS);
      const bumps = Math.max(6, Math.round(maxHW / 5));
      for (let k = 0; k <= bumps; k++) {
        const x = cx - maxHW + (2 * maxHW * k) / bumps;
        const bump = (hash(k * 1.7 + shape.w) - 0.5) * Math.min(4 * s, st * h * 0.5);
        ctx.lineTo(x, yS + bump);
      }
      ctx.lineTo(cx + maxHW, baseY + 2);
      ctx.closePath();
      ctx.fill();
    }

    // Trozos de metal
    for (const c of this.chunkSpots(v, slot, st)) {
      const x = cx + c.u * halfWidth(shape, c.t, s);
      const y = baseY - c.t * h;
      const look = CHUNKS.find((d) => d.id === c.sp)!.solid!;
      drawPiece(ctx, look.piece ?? 'granalla', look.color, x, y, 5.2 * s * c.size, hash(c.k * 9.1 + 3) * Math.PI);
    }

    if (lt > 0) {
      // Líquido
      ctx.fillStyle = rgba(look.rgb, look.alpha);
      ctx.fillRect(cx - maxHW - 2, yL, maxHW * 2 + 4, baseY - yL + 2);
      const shade = ctx.createLinearGradient(cx - maxHW, 0, cx + maxHW, 0);
      shade.addColorStop(0, 'rgba(10,30,50,0.2)');
      shade.addColorStop(0.28, 'rgba(10,30,50,0)');
      shade.addColorStop(0.7, 'rgba(10,30,50,0)');
      shade.addColorStop(1, 'rgba(10,30,50,0.24)');
      ctx.fillStyle = shade;
      ctx.fillRect(cx - maxHW - 2, yL, maxHW * 2 + 4, baseY - yL + 2);

      // Copos
      for (const fl of f.flakes) {
        const sp = POWDERS.find((p) => p.id === fl.sp)!;
        const x = cx + fl.u * halfWidth(shape, fl.t, s);
        const y = baseY - fl.t * h;
        ctx.fillStyle = rgba(mix(sp.solid!.color, [255, 255, 255], 0.12), 0.92);
        ctx.beginPath();
        ctx.ellipse(x, y, fl.size, fl.size * 0.7, fl.ph, 0, Math.PI * 2);
        ctx.fill();
      }

      // Burbujas
      ctx.lineWidth = 1;
      for (const b of f.bubbles) {
        const x = cx + b.u * (halfWidth(shape, b.t, s) - b.r);
        const y = baseY - b.t * h;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Superficie
      const rx = Math.max(2, halfWidth(shape, lt, s) - 1.7);
      const ry = clamp(rx * 0.12, 1.4, 7 * s);
      ctx.fillStyle = rgba(mix(look.rgb, [255, 255, 255], 0.4), Math.min(1, look.alpha + 0.3));
      ctx.beginPath();
      ctx.ellipse(cx, yL, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Espuma cuando burbujea fuerte
      const foam = clamp(v.gasRate * 900 + (v.boiling ? 0.8 : 0), 0, 1);
      if (foam > 0.05) {
        ctx.fillStyle = `rgba(255,255,255,${0.75 * foam})`;
        const nFoam = Math.round(rx / 2.2);
        for (let k = 0; k < nFoam; k++) {
          const a = hash(k * 2.3 + Math.floor(this.time * 9 + k * 0.37) * 0.61);
          const x = cx + (hash(k * 5.1) * 2 - 1) * rx * 0.94;
          ctx.beginPath();
          ctx.arc(x, yL - ry * 0.2 - a * 3 * s * foam, (1.3 + a * 2.2) * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // Escarcha y condensación cuando el contenido está frío
    const cold = lt > 0 ? clamp((13 - f.dispTemp) / 9, 0, 1) : 0;
    if (cold > 0.02) {
      ctx.save();
      ctx.beginPath();
      tracePath(ctx, shape, cx, baseY, s);
      ctx.closePath();
      ctx.clip();
      const top = yL - 10 * s;
      const frost = ctx.createLinearGradient(0, top, 0, top + 14 * s);
      frost.addColorStop(0, 'rgba(236,246,255,0)');
      frost.addColorStop(1, `rgba(236,246,255,${0.42 * cold})`);
      ctx.fillStyle = frost;
      ctx.fillRect(cx - maxHW - 2, top, maxHW * 2 + 4, baseY - top + 2);
      ctx.fillStyle = `rgba(255,255,255,${0.75 * cold})`;
      const dots = Math.round(maxHW * 0.9);
      for (let k = 0; k < dots; k++) {
        const t = hash(k * 4.7 + 2) * (lt + 0.02);
        const x = cx + (hash(k * 9.3) * 2 - 1) * halfWidth(shape, t, s) * 0.96;
        ctx.beginPath();
        ctx.arc(x, baseY - t * h, (0.6 + hash(k * 2.1) * 1.3) * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Brillo del vidrio
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(2, shape.kind === 'tubo' ? 2.4 * s : 4.5 * s);
    ctx.beginPath();
    for (let k = 0; k <= 16; k++) {
      const t = 0.1 + (0.8 * k) / 16;
      const x = cx - halfWidth(shape, t, s) * (shape.kind === 'tubo' ? 0.45 : 0.8);
      const y = baseY - t * h;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Graduación
    if (shape.kind !== 'tubo') {
      ctx.strokeStyle = 'rgba(56,84,100,0.7)';
      ctx.fillStyle = 'rgba(56,84,100,0.85)';
      ctx.lineWidth = 1;
      ctx.font = `600 ${Math.max(7, 8.5 * s)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let k = 1; k <= 4; k++) {
        const frac = k / 4;
        const t = levelFor(shape, frac);
        const hw = halfWidth(shape, t, s);
        const y = baseY - t * h;
        const xa = cx - hw * 0.58;
        ctx.beginPath();
        ctx.moveTo(xa, y);
        ctx.lineTo(xa + (k % 2 === 0 ? 14 : 8) * s, y);
        ctx.stroke();
        // En el cuello del erlenmeyer el número taparía al termómetro
        const room = shape.kind !== 'erlenmeyer' || k < 4;
        if (k % 2 === 0 && room) ctx.fillText(String(Math.round(v.capacity * frac)), xa + 17 * s, y);
      }
    }

    // Contorno
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    tracePath(ctx, shape, cx, baseY, s);
    ctx.stroke();
    // Boca
    const mouth = halfWidth(shape, 1, s);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, topY, mouth, Math.max(1.3, mouth * 0.07), 0, 0, Math.PI * 2);
    ctx.stroke();
    if (shape.kind === 'vaso') {
      // Pico vertedor
      ctx.beginPath();
      ctx.moveTo(cx - mouth, topY);
      ctx.quadraticCurveTo(cx - mouth - 6 * s, topY - 1.5 * s, cx - mouth - 7 * s, topY - 4.5 * s);
      ctx.stroke();
    }

    // Vapor
    for (const p of f.steam) {
      const a = Math.sin((p.life / p.max) * Math.PI) * 0.34;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawThermometer(slot: VesselSlot, temp: number): void {
    const { ctx } = this;
    const { shape, cx, baseY, scale: s } = slot;
    const h = shape.h * s;
    const mouth = halfWidth(shape, 1, s);
    const x1 = cx + shape.thermo![0] * mouth;
    const y1 = baseY - h - 30 * s;
    const x2 = cx + shape.thermo![1] * mouth;
    const y2 = baseY - 0.07 * h - 6 * s;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(70,96,112,0.75)';
    ctx.lineWidth = 7.4 * s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = '#f7fafb';
    ctx.lineWidth = 5.4 * s;
    ctx.stroke();

    // Escala
    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    ctx.strokeStyle = 'rgba(60,84,98,0.6)';
    ctx.lineWidth = 0.8;
    for (let k = 1; k <= 11; k++) {
      const u = 0.08 + (k / 12) * 0.84;
      const px = lerp(x2, x1, u);
      const py = lerp(y2, y1, u);
      const tick = (k % 2 === 0 ? 2.4 : 1.4) * s;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + nx * tick, py + ny * tick);
      ctx.stroke();
    }

    // Columna
    const frac = 0.08 + clamp((temp + 10) / 120, 0, 1) * 0.84;
    ctx.strokeStyle = '#e23a2e';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(lerp(x2, x1, frac), lerp(y2, y1, frac));
    ctx.stroke();
    ctx.fillStyle = '#e23a2e';
    ctx.strokeStyle = 'rgba(70,96,112,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x2, y2, 4.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Envase volcándose sobre el recipiente, con su chorro, gotas o granos. */
  private drawPour(p: Pour): void {
    const { ctx, game, layout: L, W } = this;
    const r = game.reagents[p.reagent];
    const b = L.bottles[p.reagent];
    const slot = L.vessels[p.vessel];
    const v = game.vessels[p.vessel];
    const s = slot.scale;

    // Vierte desde la izquierda salvo que el recipiente esté pegado a ese borde
    const dir = slot.cx - b.h * 0.6 < 6 ? -1 : 1;
    const tilt = (r.kind === 'dropper' ? 2.5 : r.kind === 'solid' ? 2.05 : 1.85) * dir;
    const reach = 10 * s;
    const mouthX = slot.cx - dir * reach;
    const mouthY = slot.topY - 20 * s;
    const cTarget: Point = {
      x: clamp(mouthX - (b.h / 2) * Math.sin(tilt), 4, W - 4),
      y: mouthY + (b.h / 2) * Math.cos(tilt),
    };
    const home: Point = { x: b.x, y: b.y - b.h / 2 };

    let pos: Point;
    let angle: number;
    if (p.phase === 'go') {
      const start = p.from ?? home;
      const u = ease(p.t / GO_TIME);
      pos = { x: lerp(start.x, cTarget.x, u), y: lerp(start.y, cTarget.y, u) };
      angle = tilt * ease((u - 0.3) / 0.7);
    } else if (p.phase === 'pour') {
      pos = cTarget;
      angle = tilt + Math.sin(this.time * 14) * 0.012;
    } else {
      const u = ease(p.t / BACK_TIME);
      pos = { x: lerp(cTarget.x, home.x, u), y: lerp(cTarget.y, home.y, u) };
      angle = tilt * (1 - ease(u / 0.7));
    }

    if (p.phase === 'pour') {
      const mx = pos.x + (b.h / 2) * Math.sin(angle);
      const my = pos.y - (b.h / 2) * Math.cos(angle);
      const lt = levelFor(slot.shape, v.vol / v.capacity);
      const endY = slot.baseY - Math.max(lt, 0.02) * slot.shape.h * s;
      const p0: Point = { x: mx, y: my };
      const p1: Point = { x: mx + dir * reach * 0.8, y: my + 3 };
      const p2: Point = { x: slot.cx, y: endY };
      const at = (u: number): Point => ({
        x: (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * p1.x + u * u * p2.x,
        y: (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * p1.y + u * u * p2.y,
      });
      const k = p.t / p.dur;
      if (r.kind === 'liquid') {
        // El chorro arranca y corta de a poco
        const head = clamp(k / 0.12, 0, 1);
        const tail = clamp((k - 0.9) / 0.1, 0, 1);
        ctx.save();
        ctx.lineCap = 'round';
        const strokeStream = (width: number, style: string): void => {
          ctx.strokeStyle = style;
          ctx.lineWidth = width;
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const pt = at(lerp(tail, head, i / 20));
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        };
        const tint = mix(r.color, [70, 130, 170], 0.25);
        strokeStream(3.6 * s, rgba(tint, 0.85));
        strokeStream(1.2 * s, 'rgba(255,255,255,0.55)');
        ctx.restore();
      } else if (r.kind === 'dropper') {
        for (let i = 0; i < 3; i++) {
          const u = k * 3.4 - i * 0.9;
          if (u <= 0 || u >= 1) continue;
          const pt = at(u * u);
          ctx.fillStyle = 'rgba(214,226,236,0.95)';
          ctx.strokeStyle = 'rgba(80,110,130,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y - 4.5 * s);
          ctx.bezierCurveTo(pt.x + 3.4 * s, pt.y, pt.x + 2.6 * s, pt.y + 3.4 * s, pt.x, pt.y + 3.4 * s);
          ctx.bezierCurveTo(pt.x - 2.6 * s, pt.y + 3.4 * s, pt.x - 3.4 * s, pt.y, pt.x, pt.y - 4.5 * s);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        const kind = r.piece ?? 'granalla';
        const pieces = kind === 'cinta' ? 2 : kind === 'cristal' ? 12 : 6;
        const size = (kind === 'cristal' ? 3.2 : 5) * s;
        for (let i = 0; i < pieces; i++) {
          const u = k * 1.9 - i * (0.9 / pieces);
          if (u <= 0 || u >= 1) continue;
          const pt = at(u * u);
          drawPiece(ctx, kind, r.color, pt.x + (hash(i) - 0.5) * 9 * s, pt.y, size, u * 7 + i);
        }
      }
    }

    drawBottle(ctx, r, pos.x, pos.y, b.w, b.h, angle, Math.abs(angle) > 0.3);
  }
}

// --- Envases -------------------------------------------------------------------

function bottleSize(r: ReagentDef, bw: number, bh: number): [number, number] {
  if (r.kind === 'dropper') return [bw * 0.7, bh * 0.84];
  if (r.kind === 'solid') return [bw, bh * 0.76];
  return [bw, bh];
}

function bandColor(r: ReagentDef): string {
  if (r.formula === 'HCl') return '#e2574a';
  if (r.formula === 'NaOH') return '#7a63d6';
  if (r.formula === 'H₂O') return '#4aa3e2';
  if (r.kind === 'solid') return '#7b8a94';
  if (r.kind === 'dropper') return '#d6457f';
  return '#e0a330';
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  r: ReagentDef,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = '#fdfdfb';
  roundRect(ctx, x, y, w, h, 2.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,80,95,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = bandColor(r);
  ctx.fillRect(x + 0.6, y + 0.6, w - 1.2, Math.max(2, h * 0.13));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1d2b33';
  let size = Math.min(h * 0.44, 13);
  const face = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.font = `700 ${size}px ${face}`;
  const maxW = w - 4;
  const tw = ctx.measureText(r.formula).width;
  if (tw > maxW) {
    size *= maxW / tw;
    ctx.font = `700 ${size}px ${face}`;
  }
  const hasConc = r.conc !== '';
  ctx.fillText(r.formula, x + w / 2, y + h * (hasConc ? 0.44 : 0.58));
  if (hasConc) {
    let cs = Math.min(h * 0.27, 9);
    ctx.font = `600 ${cs}px ${face}`;
    const cw = ctx.measureText(r.conc).width;
    if (cw > maxW) {
      cs *= maxW / cw;
      ctx.font = `600 ${cs}px ${face}`;
    }
    ctx.fillStyle = '#51636e';
    ctx.fillText(r.conc, x + w / 2, y + h * 0.79);
  }
}

/** Dibuja un envase centrado en (cx, cy) y girado `angle` radianes. */
function drawBottle(
  ctx: CanvasRenderingContext2D,
  r: ReagentDef,
  cx: number,
  cy: number,
  w: number,
  h: number,
  angle: number,
  open: boolean,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const x0 = -w / 2;
  const y0 = -h / 2;
  ctx.lineJoin = 'round';

  if (r.kind === 'liquid') {
    const neckW = w * 0.3;
    const shoulder = y0 + h * 0.34;
    const body = (): void => {
      const rad = w * 0.13;
      ctx.beginPath();
      ctx.moveTo(-neckW / 2, y0 + h * 0.12);
      ctx.lineTo(-neckW / 2, y0 + h * 0.2);
      ctx.quadraticCurveTo(x0, y0 + h * 0.22, x0, shoulder);
      ctx.lineTo(x0, h / 2 - rad);
      ctx.quadraticCurveTo(x0, h / 2, x0 + rad, h / 2);
      ctx.lineTo(-x0 - rad, h / 2);
      ctx.quadraticCurveTo(-x0, h / 2, -x0, h / 2 - rad);
      ctx.lineTo(-x0, shoulder);
      ctx.quadraticCurveTo(-x0, y0 + h * 0.22, neckW / 2, y0 + h * 0.2);
      ctx.lineTo(neckW / 2, y0 + h * 0.12);
      ctx.closePath();
    };
    body();
    ctx.fillStyle = 'rgba(246,251,253,0.82)';
    ctx.fill();
    ctx.save();
    body();
    ctx.clip();
    ctx.fillStyle = rgba(r.color, 0.9);
    ctx.fillRect(x0, y0 + h * 0.4, w, h * 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x0 + w * 0.1, y0 + h * 0.24, w * 0.11, h * 0.74);
    ctx.restore();
    body();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Labio y tapón
    ctx.fillStyle = 'rgba(246,251,253,0.95)';
    roundRect(ctx, -neckW / 2 - w * 0.04, y0 + h * 0.1, neckW + w * 0.08, h * 0.035, 1.5);
    ctx.fill();
    ctx.stroke();
    if (!open) {
      ctx.fillStyle = '#31434e';
      roundRect(ctx, -neckW / 2 - w * 0.02, y0, neckW + w * 0.04, h * 0.11, 2.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-neckW / 2 + 1, y0 + 1.5, neckW * 0.25, h * 0.08);
    }
    drawLabel(ctx, r, x0 + w * 0.06, y0 + h * 0.5, w * 0.88, h * 0.34);
  } else if (r.kind === 'dropper') {
    // Gotero de vidrio ámbar
    if (!open) {
      ctx.fillStyle = '#23303a';
      ctx.beginPath();
      ctx.ellipse(0, y0 + h * 0.1, w * 0.2, h * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Pipeta a la vista
      ctx.fillStyle = 'rgba(240,248,252,0.9)';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w * 0.07, y0 + h * 0.2);
      ctx.lineTo(-w * 0.025, y0 - h * 0.02);
      ctx.lineTo(w * 0.025, y0 - h * 0.02);
      ctx.lineTo(w * 0.07, y0 + h * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#23303a';
    roundRect(ctx, -w * 0.27, y0 + h * 0.17, w * 0.54, h * 0.1, 2);
    ctx.fill();
    const amber = ctx.createLinearGradient(x0, 0, -x0, 0);
    amber.addColorStop(0, '#a8601f');
    amber.addColorStop(0.35, '#d08a3c');
    amber.addColorStop(1, '#8f4f18');
    ctx.fillStyle = amber;
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, y0 + h * 0.27);
    ctx.quadraticCurveTo(x0, y0 + h * 0.3, x0, y0 + h * 0.44);
    ctx.lineTo(x0, h / 2 - 4);
    ctx.quadraticCurveTo(x0, h / 2, x0 + 4, h / 2);
    ctx.lineTo(-x0 - 4, h / 2);
    ctx.quadraticCurveTo(-x0, h / 2, -x0, h / 2 - 4);
    ctx.lineTo(-x0, y0 + h * 0.44);
    ctx.quadraticCurveTo(-x0, y0 + h * 0.3, w * 0.22, y0 + h * 0.27);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,44,14,0.8)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x0 + w * 0.12, y0 + h * 0.36, w * 0.1, h * 0.58);
    drawLabel(ctx, r, x0 + w * 0.04, y0 + h * 0.52, w * 0.92, h * 0.34);
  } else {
    // Pote de sólidos
    const top = y0 + h * 0.16;
    roundRect(ctx, x0, top, w, h - h * 0.16, w * 0.12);
    ctx.fillStyle = 'rgba(246,251,253,0.82)';
    ctx.fill();
    ctx.save();
    roundRect(ctx, x0, top, w, h - h * 0.16, w * 0.12);
    ctx.clip();
    ctx.fillStyle = rgba(mix(r.color, [40, 50, 58], 0.25), 0.95);
    ctx.fillRect(x0, y0 + h * 0.36, w, h);
    const kind = r.piece ?? 'granalla';
    const count = kind === 'cristal' ? 16 : 9;
    for (let k = 0; k < count; k++) {
      drawPiece(
        ctx,
        kind,
        r.color,
        x0 + w * (0.14 + 0.72 * hash(k * 3.3)),
        y0 + h * (0.34 + 0.14 * hash(k * 7.7 + 1)),
        w * (kind === 'cristal' ? 0.06 : 0.085),
        hash(k) * 3,
      );
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x0 + w * 0.1, top + 2, w * 0.1, h);
    ctx.restore();
    roundRect(ctx, x0, top, w, h - h * 0.16, w * 0.12);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (!open) {
      ctx.fillStyle = '#3a5562';
      roundRect(ctx, x0 - w * 0.02, y0, w * 1.04, h * 0.2, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x0 + 2, y0 + 2, w * 0.3, h * 0.05);
    }
    drawLabel(ctx, r, x0 + w * 0.06, y0 + h * 0.52, w * 0.88, h * 0.38);
  }
  ctx.restore();
}

/** Un trozo de sólido: granalla, cinta, viruta, cristal o grano de polvo. */
function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: PieceKind,
  col: RGB,
  x: number,
  y: number,
  size: number,
  rot: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const dark = rgba(mix(col, [0, 0, 0], 0.45));
  if (piece === 'cristal') {
    ctx.fillStyle = rgba(col);
    ctx.strokeStyle = 'rgba(120,140,160,0.9)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.rect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4);
    ctx.fill();
    ctx.stroke();
  } else if (piece === 'polvo') {
    ctx.fillStyle = rgba(col);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (piece === 'cinta') {
    ctx.fillStyle = rgba(col);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.8;
    roundRect(ctx, -size * 1.5, -size * 0.34, size * 3, size * 0.68, size * 0.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-size * 1.3, -size * 0.24, size * 2.2, size * 0.16);
  } else if (piece === 'viruta') {
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark;
    ctx.lineWidth = size * 0.52;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.72, 0.4, Math.PI * 1.75);
    ctx.stroke();
    ctx.strokeStyle = rgba(col);
    ctx.lineWidth = size * 0.34;
    ctx.stroke();
  } else {
    ctx.fillStyle = rgba(col);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.3, -size * 0.25, size * 0.32, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
