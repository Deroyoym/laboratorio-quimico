import './style.css';
import { MOLAR_GAS_ML, VESSEL_NAMES, pH } from './chem/engine';
import { SPECIES } from './chem/species';
import { Game } from './game/game';
import { fmt } from './game/goals';
import { LEVELS } from './game/levels';
import { clearProgress, isUnlocked, loadProgress, saveProgress, type Progress } from './game/storage';
import { Scene } from './render/scene';

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  reset:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/></svg>',
  flame:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3C10.500 8 11 5 12 2z"/></svg>',
  sink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14l-1.5 12a2 2 0 0 1-2 1.800h-7a2 2 0 0 1-2-1.800z"/><path d="M9 7V4h6v3"/></svg>',
  logo: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#12303a"/><path d="M22.500 38h19l7 12a4 4 0 0 1-3.500 6H19a4 4 0 0 1-3.500-6z" fill="#3fd0b6"/><circle cx="29" cy="46" r="2.400" fill="#e8fffa"/><circle cx="37" cy="50" r="1.600" fill="#e8fffa"/><circle cx="34" cy="41" r="1.200" fill="#e8fffa"/><path d="M26 10h12v3h-2v14l13 22a5 5 0 0 1-4.300 7.500H19.300A5 5 0 0 1 15 49l13-22V13h-2z" fill="none" stroke="#e8f4f8" stroke-width="2.400" stroke-linejoin="round"/></svg>',
};

const app = document.getElementById('app')!;
app.innerHTML = `
  <section id="menu" class="screen menu">
    <div class="brand">
      ${ICON.logo}
      <div>
        <h1>Laboratorio Químico</h1>
        <p>Mezclá, observá y resolvé cada desafío.</p>
      </div>
    </div>
    <h2>Niveles</h2>
    <div id="levels" class="levels"></div>
    <div class="menu-foot">
      <span id="total-stars"></span>
      <button id="btn-clear" class="link-btn">Borrar progreso</button>
    </div>
  </section>

  <section id="play" class="screen hidden">
    <header class="hud">
      <div class="hud-row">
        <button id="btn-menu" class="icon-btn" aria-label="Volver a los niveles">${ICON.back}</button>
        <div class="hud-title"><small id="lvl-num"></small><strong id="lvl-name"></strong></div>
        <button id="btn-hint" class="icon-btn">Pista</button>
        <button id="btn-reset" class="icon-btn" aria-label="Reiniciar el nivel">${ICON.reset}</button>
      </div>
      <ul id="goals" class="goals"></ul>
    </header>
    <div class="stage">
      <canvas id="lab"></canvas>
      <div id="toasts" class="toasts" aria-live="polite"></div>
    </div>
    <footer class="controls">
      <div id="readout" class="readout"></div>
      <div id="status" class="status"></div>
      <div class="ctrl-row">
        <div id="doses" class="seg"></div>
        <button id="btn-burner" class="act-btn">${ICON.flame}<span>Mechero</span></button>
        <button id="btn-empty" class="act-btn">${ICON.sink}<span>Vaciar</span></button>
      </div>
    </footer>
  </section>

  <div id="modal" class="modal hidden"></div>
  <div class="rotate">Girá el teléfono: el laboratorio se juega en vertical.</div>
`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const menuEl = $('menu');
const playEl = $('play');
const modalEl = $('modal');
const canvas = $<HTMLCanvasElement>('lab');
const goalsEl = $('goals');
const readoutEl = $('readout');
const statusEl = $('status');
const dosesEl = $('doses');
const toastsEl = $('toasts');
const burnerBtn = $('btn-burner');

let progress: Progress = loadProgress();
let levelIndex = 0;
let game: Game | null = null;
let scene: Scene | null = null;
let hintStep = 0;
let uiDirty = true;
let uiTimer = 0;

const starsHtml = (n: number): string => '<b>' + '★'.repeat(n) + '</b>' + '★'.repeat(3 - n);

// --- Menú -------------------------------------------------------------------

function renderMenu(): void {
  const list = $('levels');
  list.innerHTML = '';
  let total = 0;
  LEVELS.forEach((l, i) => {
    const stars = progress.stars[l.id] ?? 0;
    total += stars;
    const unlocked = isUnlocked(progress, i);
    const card = document.createElement('button');
    card.className = 'level-card' + (stars ? ' done' : '') + (unlocked ? '' : ' locked');
    card.innerHTML = `
      <span class="num">${unlocked ? i + 1 : '🔒'}</span>
      <span><span class="name">${l.title}</span><br /><span class="tag">${l.tag}</span></span>
      <span class="stars">${starsHtml(stars)}</span>`;
    card.addEventListener('click', () => {
      if (unlocked) startLevel(i);
      else showModal(`<h2>Nivel bloqueado</h2><p>Superá «${LEVELS[i - 1].title}» para abrir este nivel.</p>`, [
        { label: 'Entendido', primary: true },
      ]);
    });
    list.appendChild(card);
  });
  $('total-stars').textContent = `${total} / ${LEVELS.length * 3} ★`;
}

function showMenu(): void {
  game = null;
  playEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  hideModal();
  renderMenu();
}

$('btn-clear').addEventListener('click', () => {
  showModal('<h2>¿Borrar el progreso?</h2><p>Se pierden las estrellas y los niveles desbloqueados.</p>', [
    { label: 'Cancelar' },
    {
      label: 'Borrar',
      primary: true,
      action: () => {
        clearProgress();
        progress = { stars: {} };
        renderMenu();
      },
    },
  ]);
});

// --- Modal ------------------------------------------------------------------

interface ModalButton {
  label: string;
  primary?: boolean;
  action?: () => void;
}

function showModal(html: string, buttons: ModalButton[]): void {
  modalEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}<div class="sheet-actions"></div></div>`;
  const row = modalEl.querySelector('.sheet-actions')!;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '');
    el.textContent = b.label;
    el.addEventListener('click', () => {
      hideModal();
      b.action?.();
    });
    row.appendChild(el);
  }
  modalEl.classList.remove('hidden');
}

function hideModal(): void {
  modalEl.classList.add('hidden');
  modalEl.innerHTML = '';
}

// --- Partida ----------------------------------------------------------------

function toast(text: string, tone: 'info' | 'warn' = 'info'): void {
  const el = document.createElement('div');
  el.className = 'toast' + (tone === 'warn' ? ' warn' : '');
  el.textContent = text;
  toastsEl.appendChild(el);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild!.remove();
  setTimeout(() => el.classList.add('out'), 3000);
  setTimeout(() => el.remove(), 3500);
}

function startLevel(i: number): void {
  levelIndex = i;
  hintStep = 0;
  const level = LEVELS[i];
  game = new Game(level, {
    toast,
    changed: () => (uiDirty = true),
    won: onWin,
  });
  menuEl.classList.add('hidden');
  playEl.classList.remove('hidden');
  toastsEl.innerHTML = '';

  $('lvl-num').textContent = `Nivel ${i + 1} · ${level.tag}`;
  $('lvl-name').textContent = level.title;
  burnerBtn.classList.toggle('hidden', !level.tools.burner);
  goalsEl.innerHTML = level.goals
    .map(() => '<li><span class="mark"></span><span class="label"></span><span class="value"></span></li>')
    .join('');

  if (!scene) scene = new Scene(canvas, game);
  else scene.setGame(game);
  scene.resize();
  uiDirty = true;
  refreshUi(true);

  showModal(
    `<div class="kicker">Nivel ${i + 1} · ${level.tag}</div><h2>${level.title}</h2><p>${level.brief}</p>` +
      `<ul>${level.goals.map((g) => `<li>${g.label}</li>`).join('')}</ul>`,
    [{ label: 'Empezar', primary: true }],
  );
}

function onWin(stars: number): void {
  const g = game!;
  const level = g.level;
  const prev = progress.stars[level.id] ?? 0;
  if (stars > prev) {
    progress.stars[level.id] = stars;
    saveProgress(progress);
  }
  const last = levelIndex === LEVELS.length - 1;
  setTimeout(() => {
    if (game !== g) return;
    const buttons: ModalButton[] = [{ label: 'Repetir', action: () => startLevel(levelIndex) }];
    if (last) buttons.push({ label: 'Niveles', primary: true, action: showMenu });
    else buttons.push({ label: 'Siguiente nivel', primary: true, action: () => startLevel(levelIndex + 1) });
    showModal(
      `<div class="kicker">¡Nivel superado!</div><h2>${level.title}</h2>` +
        `<div class="big-stars">${starsHtml(stars)}</div>` +
        `<p class="meta">Lo resolviste en ${g.actions} ${g.actions === 1 ? 'acción' : 'acciones'} · 3 estrellas con ${level.par} o menos</p>` +
        `<div class="kicker">¿Qué pasó?</div>${level.explain}` +
        (last ? '<p><b>Completaste los cinco niveles.</b> Pronto habrá más experimentos.</p>' : ''),
      buttons,
    );
  }, 900);
}

$('btn-menu').addEventListener('click', showMenu);
$('btn-reset').addEventListener('click', () => {
  game?.reset();
  hintStep = 0;
  toastsEl.innerHTML = '';
});
$('btn-hint').addEventListener('click', () => {
  if (!game) return;
  const hints = game.level.hints;
  const shown = Math.min(hintStep, hints.length - 1);
  const more = shown < hints.length - 1;
  showModal(
    `<div class="kicker">Pista ${shown + 1} de ${hints.length}</div><h2>${game.level.title}</h2>` +
      `<p>${game.level.brief}</p><p><b>${hints[shown]}</b></p>`,
    more
      ? [{ label: 'Cerrar', primary: true, action: () => (hintStep = shown + 1) }]
      : [{ label: 'Cerrar', primary: true }],
  );
});
$('btn-empty').addEventListener('click', () => game?.emptySelected());
burnerBtn.addEventListener('click', () => game?.toggleBurner());

// --- HUD --------------------------------------------------------------------

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function refreshUi(force = false): void {
  const g = game;
  if (!g) return;

  // Objetivos
  const res = g.results();
  res.conds.forEach((c, i) => {
    const li = goalsEl.children[i] as HTMLElement;
    const cls = c.broken ? 'broken' : c.ok ? 'ok' : '';
    if (li.className !== cls) li.className = cls;
    setText(li.children[1], c.label);
    setText(li.children[2], c.value ?? '');
  });

  // Instrumentos del recipiente elegido
  const v = g.vessels[g.selVessel];
  const chips: [string, string, boolean][] = [
    [VESSEL_NAMES[v.kind].split(' ')[0], `${fmt(v.vol, v.vol < 10 && v.vol > 0 ? 1 : 0)} mL`, false],
    ['Temperatura', `${fmt(v.temp)} °C`, v.temp >= 40],
  ];
  if (g.level.tools.phMeter) {
    const p = pH(v);
    chips.push(['pH-metro', p === null ? '—' : fmt(p), false]);
  }
  if (g.level.tools.gas) {
    const sp = g.level.tools.gas;
    chips.push([`${SPECIES[sp].formula} recogido`, `${Math.floor((v.gasOut[sp] ?? 0) * MOLAR_GAS_ML)} mL`, false]);
  }
  if (readoutEl.children.length !== chips.length) {
    readoutEl.innerHTML = chips.map(() => '<div class="chip"><small></small><b></b></div>').join('');
  }
  chips.forEach(([label, value, hot], i) => {
    const chip = readoutEl.children[i] as HTMLElement;
    setText(chip.children[0], label);
    setText(chip.children[1], value);
    const cls = 'chip' + (hot ? ' hot' : '');
    if (chip.className !== cls) chip.className = cls;
  });

  if (!uiDirty && !force) return;
  uiDirty = false;

  // Estado y dosis
  const r = g.selReagent !== null ? g.reagents[g.selReagent] : null;
  if (g.won) statusEl.innerHTML = '<em>¡Objetivo cumplido!</em>';
  else if (r) {
    const target = g.vessels.length > 1 ? 'un recipiente' : `el ${VESSEL_NAMES[g.vessels[0].kind].split(' ')[0].toLowerCase()}`;
    statusEl.innerHTML = `<span><b>${r.name}</b>${r.conc && r.kind === 'liquid' ? ` ${r.formula} ${r.conc}` : ''} — tocá ${target} para agregar <em>${g.doseText(r)}</em></span>`;
  } else statusEl.innerHTML = '<span>Elegí un reactivo de la estantería, o arrastralo hasta el recipiente.</span>';

  if (r && r.kind !== 'liquid') {
    dosesEl.className = 'seg fixed';
    dosesEl.textContent = `Dosis fija: ${r.doseLabel}`;
  } else {
    dosesEl.className = 'seg';
    dosesEl.innerHTML = '<span class="unit">mL</span>';
    for (const d of g.level.doses) {
      const b = document.createElement('button');
      b.textContent = String(d);
      b.setAttribute('aria-label', `Dosis de ${d} mL`);
      if (d === g.dose) b.className = 'on';
      b.addEventListener('click', () => g.setDose(d));
      dosesEl.appendChild(b);
    }
  }
  burnerBtn.classList.toggle('lit', g.vessels[g.selVessel].heating);
  burnerBtn.lastElementChild!.textContent = g.vessels[g.selVessel].heating ? 'Apagar' : 'Mechero';
}

// --- Entrada táctil ---------------------------------------------------------

let press: { id: number; idx: number; x: number; y: number; drag: boolean } | null = null;

function pointerPos(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (e) => {
  if (!game || !scene || game.won || press) return;
  const p = pointerPos(e);
  const b = scene.hitBottle(p.x, p.y);
  if (b >= 0) {
    press = { id: e.pointerId, idx: b, x: p.x, y: p.y, drag: false };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  const v = scene.hitVessel(p.x, p.y);
  if (v >= 0) game.tapVessel(v);
  else game.selectReagent(null);
});

canvas.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id || !game || !scene) return;
  const p = pointerPos(e);
  if (!press.drag && Math.hypot(p.x - press.x, p.y - press.y) > 12 && !game.pour) {
    press.drag = true;
    game.selectReagent(press.idx);
  }
  if (press.drag) scene.drag = { idx: press.idx, x: p.x, y: p.y };
});

function endPress(e: PointerEvent, cancelled: boolean): void {
  if (!press || e.pointerId !== press.id) return;
  const { idx, drag } = press;
  press = null;
  if (!game || !scene) return;
  if (!drag) {
    if (!cancelled) game.tapReagent(idx);
    return;
  }
  const d = scene.drag;
  scene.drag = null;
  if (!d) return;
  const from = { x: d.x, y: d.y - scene.bottleHeight(idx) * 0.75 };
  const v = cancelled ? -1 : scene.hitVessel(d.x, d.y);
  if (v >= 0) {
    game.requestPour(idx, v, from);
    game.selectReagent(null);
  } else {
    scene.releaseBottle(idx, from);
    game.selectReagent(null);
  }
}
canvas.addEventListener('pointerup', (e) => endPress(e, false));
canvas.addEventListener('pointercancel', (e) => endPress(e, true));

// --- Bucle principal --------------------------------------------------------

new ResizeObserver(() => scene?.resize()).observe(canvas);

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game && scene && !playEl.classList.contains('hidden')) {
    // Con un cartel abierto la química queda en pausa
    if (modalEl.classList.contains('hidden') || game.won) {
      game.update(dt);
      scene.update(dt);
    }
    scene.draw();
    uiTimer += dt;
    if (uiDirty || uiTimer > 0.1) {
      uiTimer = 0;
      refreshUi();
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

showMenu();

// Acceso para pruebas automáticas y para curiosear desde la consola
declare global {
  interface Window {
    lab?: { game: () => Game | null; start: (i: number) => void };
  }
}
window.lab = { game: () => game, start: startLevel };
