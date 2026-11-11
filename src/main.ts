import './style.css';
import { Sound, type SoundName } from './audio/sound';
import { MOLAR_GAS_ML, VESSEL_NAMES, pH } from './chem/engine';
import { SPECIES } from './chem/species';
import { Game } from './game/game';
import { fmt } from './game/goals';
import { LEVELS } from './game/levels';
import { SaveStore, browserStorage, type SessionSave, type Settings } from './game/storage';
import { PerfProbe } from './perf';
import { Scene } from './render/scene';
import { initNav, popBack, pushBack } from './ui/nav';
import { closeSheet, initSheets, onSheetChange, openSheet, sheetOpen, type SheetButton } from './ui/sheet';

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>'),
  flame:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3C10.5 8 11 5 12 2z"/></svg>',
  sink: svg('<path d="M5 7h14l-1.5 12a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8z"/><path d="M9 7V4h6v3"/>'),
  bulb: svg(
    '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  ),
  gear: svg(
    '<path d="M4 7h9M19 7h1M4 12h3M13 12h7M4 17h10M20 17h0"/><circle cx="16" cy="7" r="2.4"/><circle cx="10" cy="12" r="2.4"/><circle cx="17" cy="17" r="2.4"/>',
  ),
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  logo: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#12303a"/><path d="M22.5 38h19l7 12a4 4 0 0 1-3.5 6H19a4 4 0 0 1-3.5-6z" fill="#3fd0b6"/><circle cx="29" cy="46" r="2.4" fill="#e8fffa"/><circle cx="37" cy="50" r="1.6" fill="#e8fffa"/><circle cx="34" cy="41" r="1.2" fill="#e8fffa"/><path d="M26 10h12v3h-2v14l13 22a5 5 0 0 1-4.3 7.5H19.3A5 5 0 0 1 15 49l13-22V13h-2z" fill="none" stroke="#e8f4f8" stroke-width="2.4" stroke-linejoin="round"/></svg>',
};

const app = document.getElementById('app')!;
app.innerHTML = `
  <section id="menu" class="screen menu">
    <div class="menu-inner">
      <header class="brand">
        ${ICON.logo}
        <div class="brand-text">
          <h1>Laboratorio Químico</h1>
          <p>Mezclá, observá y resolvé cada desafío.</p>
        </div>
        <button id="btn-settings-menu" class="icon-btn" aria-label="Ajustes">${ICON.gear}</button>
      </header>
      <p id="save-note" class="save-note hidden" role="status"></p>
      <button id="btn-continue" class="continue">
        <span class="continue-icon">${ICON.play}</span>
        <span class="continue-text"><small id="continue-kicker"></small><strong id="continue-title"></strong></span>
      </button>
      <div class="progress" aria-hidden="true"><div id="progress-bar" class="progress-bar"></div></div>
      <p id="progress-text" class="progress-text"></p>
      <h2>Niveles</h2>
      <div id="levels" class="levels"></div>
    </div>
  </section>

  <section id="play" class="screen hidden">
    <header class="hud">
      <div class="hud-row">
        <button id="btn-menu" class="icon-btn" aria-label="Volver a los niveles">${ICON.back}</button>
        <div class="hud-title"><small id="lvl-num"></small><strong id="lvl-name"></strong></div>
        <button id="btn-hint" class="icon-btn" aria-label="Pista">${ICON.bulb}</button>
        <button id="btn-reset" class="icon-btn" aria-label="Reiniciar el nivel">${ICON.reset}</button>
        <button id="btn-settings" class="icon-btn" aria-label="Ajustes">${ICON.gear}</button>
      </div>
      <ul id="goals" class="goals" aria-label="Objetivos del nivel"></ul>
    </header>
    <div class="stage">
      <canvas id="lab-bg" aria-hidden="true"></canvas>
      <canvas id="lab" tabindex="0" aria-label="Mesada del laboratorio. Con el teclado: números para elegir un reactivo, flechas para el recipiente y la dosis, Enter para verter."></canvas>
      <div id="toasts" class="toasts" aria-live="polite"></div>
    </div>
    <footer class="controls">
      <div id="readout" class="readout"></div>
      <div id="status" class="status"></div>
      <div class="ctrl-row">
        <div id="doses" class="seg" role="group" aria-label="Dosis"></div>
        <button id="btn-burner" class="act-btn">${ICON.flame}<span>Mechero</span></button>
        <button id="btn-empty" class="act-btn">${ICON.sink}<span>Vaciar</span></button>
      </div>
      <div id="winbar" class="winbar">
        <span id="win-stars" class="stars"></span>
        <button id="btn-explain" class="btn">Explicación</button>
        <button id="btn-next" class="btn primary"></button>
      </div>
    </footer>
  </section>

  <div id="modal" class="modal hidden"></div>
  <div class="rotate">Girá el teléfono: el laboratorio se juega en vertical.</div>
`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const menuEl = $('menu');
const playEl = $('play');
const canvas = $<HTMLCanvasElement>('lab');
const goalsEl = $('goals');
const readoutEl = $('readout');
const statusEl = $('status');
const dosesEl = $('doses');
const toastsEl = $('toasts');
const burnerBtn = $('btn-burner');
const controlsEl = playEl.querySelector('.controls') as HTMLElement;

const store = new SaveStore(browserStorage());
// La primera vez se respeta lo que pide el sistema sobre animaciones
if (store.status === 'new' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  store.data.settings.calm = true;
}
const sound = new Sound(store.data.settings.sound);
const perf = new PerfProbe();

let levelIndex = 0;
let game: Game | null = null;
let scene: Scene | null = null;
let hintStep = 0;
let uiDirty = true;
let uiTimer = 0;
let lastStars = 0;
/** Objetivos que ya estaban cumplidos, para festejar solo los nuevos */
let goalsOk: boolean[] = [];

initNav();
initSheets($('modal'));
onSheetChange(() => scene?.invalidate());

const starsHtml = (n: number): string =>
  `<span role="img" aria-label="${n} de 3 estrellas"><b>${'★'.repeat(n)}</b>${'★'.repeat(3 - n)}</span>`;

// --- Avisos, vibración y guardado -------------------------------------------

function toast(text: string, tone: 'info' | 'warn' = 'info'): void {
  const el = document.createElement('div');
  el.className = 'toast' + (tone === 'warn' ? ' warn' : '');
  el.textContent = text;
  toastsEl.appendChild(el);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild!.remove();
  setTimeout(() => el.classList.add('out'), 3000);
  setTimeout(() => el.remove(), 3500);
}

function buzz(pattern: number | number[]): void {
  if (!store.data.settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // sin vibración en este dispositivo
  }
}

function sfx(name: SoundName): void {
  sound.play(name);
  if (name === 'warn') buzz(40);
  else if (name === 'win') buzz([30, 50, 30, 50, 80]);
  else if (name === 'goal') buzz(15);
}

const WRITE_FAILED = 'No se pudo guardar el progreso: el almacenamiento está lleno o bloqueado.';

/** Texto para el jugador cuando el guardado no está funcionando bien. */
function saveProblem(): string | null {
  switch (store.status) {
    case 'unavailable':
      return 'Este navegador no permite guardar: el progreso se pierde al cerrar la página.';
    case 'corrupt':
      return 'No se pudo leer el progreso guardado. Se empezó de cero.';
    case 'backup':
      return 'El guardado estaba dañado y se recuperó la copia anterior.';
    case 'newer':
      return 'El progreso es de una versión más nueva del juego. Recargá la página para actualizar; mientras tanto no se guarda.';
    default:
      return null;
  }
}

let warnedSave = false;
/** Avisa una sola vez si una escritura falló. */
function checkSaved(ok: boolean): void {
  if (ok || warnedSave) return;
  warnedSave = true;
  if (!playEl.classList.contains('hidden')) toast(saveProblem() ?? WRITE_FAILED, 'warn');
  else renderMenu();
}

function applySettings(): void {
  const s = store.data.settings;
  document.documentElement.classList.toggle('calm', s.calm);
  if (scene) {
    scene.calm = s.calm;
    scene.invalidate();
  }
  if (sound.enabled !== s.sound) sound.setEnabled(s.sound);
}

/** Autoguardado de la partida en curso: solo en momentos seguros. */
let activeSinceSave = false;
let savedActions = -1;
function saveSession(force = false): void {
  if (!game) return;
  const snap = game.snapshot();
  if (!snap) return;
  if (!force && !activeSinceSave && snap.actions === savedActions) return;
  if (store.saveSession(snap)) {
    activeSinceSave = false;
    savedActions = snap.actions;
  }
}

// --- Menú -------------------------------------------------------------------

function renderMenu(): void {
  const total = store.totalStars();
  const done = LEVELS.filter((l) => store.stars(l.id) > 0).length;
  $('progress-bar').style.width = `${(total / (LEVELS.length * 3)) * 100}%`;
  $('progress-text').textContent =
    `${total} de ${LEVELS.length * 3} estrellas · ${done} de ${LEVELS.length} niveles superados`;

  const note = $('save-note');
  const problem = saveProblem() ?? (warnedSave ? WRITE_FAILED : null);
  note.classList.toggle('hidden', !problem);
  note.textContent = problem ?? '';

  // Continuar: la partida a medio hacer o el primer nivel sin ganar
  const session = store.loadSession();
  const idx = session ? LEVELS.findIndex((l) => l.id === session.level) : store.nextLevel();
  const allDone = done === LEVELS.length && !session;
  $('continue-kicker').textContent = session
    ? 'Seguir donde lo dejaste'
    : total === 0
      ? 'Empezar'
      : allDone
        ? 'Volver a jugar'
        : 'Continuar';
  $('continue-title').textContent = `Nivel ${idx + 1} · ${LEVELS[idx].title}`;
  $('btn-continue').onclick = () => startLevel(idx);

  const list = $('levels');
  list.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const stars = store.stars(l.id);
    const best = store.best(l.id);
    const unlocked = store.isUnlocked(i);
    const card = document.createElement('button');
    card.className = 'level-card' + (stars ? ' done' : '') + (unlocked ? '' : ' locked');
    const state = unlocked ? (stars ? `${stars} de 3 estrellas` : 'Sin jugar') : 'Bloqueado';
    card.setAttribute('aria-label', `Nivel ${i + 1}, ${l.title}. ${state}`);
    const sub = !unlocked
      ? 'Bloqueado'
      : best
        ? `${l.tag} · mejor: ${best} ${best === 1 ? 'acción' : 'acciones'}`
        : l.tag;
    card.innerHTML = `
      <span class="num">${unlocked ? i + 1 : '🔒'}</span>
      <span class="level-text"><span class="name">${l.title}</span><span class="tag">${sub}</span></span>
      <span class="stars">${starsHtml(stars)}</span>`;
    card.addEventListener('click', () => {
      if (unlocked) startLevel(i);
      else
        openSheet({
          html: `<h2>Nivel bloqueado</h2><p>Superá «${LEVELS[i - 1].title}» para abrir este nivel.</p>`,
          buttons: [{ label: 'Entendido', primary: true }],
        });
    });
    list.appendChild(card);
  });
}

/** Deja la pantalla del menú a la vista (lo llama la navegación al volver). */
function showMenuScreen(): void {
  saveSession(true);
  game = null;
  sound.silence();
  playEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  renderMenu();
  $('btn-continue').focus({ preventScroll: true });
}

/** Sale del nivel hacia el menú, igual que el botón atrás. */
function exitToMenu(): void {
  if (!game) return;
  if (sheetOpen()) closeSheet(() => popBack());
  else popBack();
}

// --- Ajustes ----------------------------------------------------------------

const SHORTCUTS: [string, string][] = [
  ['1 – 9', 'Elegir un reactivo'],
  ['← →', 'Cambiar de recipiente'],
  ['↑ ↓', 'Cambiar la dosis'],
  ['Enter o espacio', 'Verter'],
  ['M', 'Mechero'],
  ['V', 'Vaciar'],
  ['R', 'Reiniciar el nivel'],
  ['P', 'Pista'],
  ['Esc', 'Soltar el reactivo o volver'],
];

function confirmClear(): void {
  openSheet({
    html: '<h2>¿Borrar el progreso?</h2><p>Se pierden las estrellas, las mejores marcas y la partida en curso. Los ajustes se conservan.</p>',
    buttons: [
      { label: 'Cancelar' },
      {
        label: 'Borrar',
        primary: true,
        action: () => {
          checkSaved(store.clearProgress());
          renderMenu();
        },
      },
    ],
  });
}

function openSettings(): void {
  const inGame = !!game;
  const rows: [keyof Settings, string, string][] = [
    ['sound', 'Sonido', 'Efectos del laboratorio'],
    ['haptics', 'Vibración', 'En teléfonos que la admiten'],
    ['calm', 'Menos animación', 'Sin vaivenes ni transiciones'],
  ];
  const toggles = rows
    .map(
      ([key, label, hint]) =>
        `<button class="toggle" role="switch" data-setting="${key}" aria-checked="${store.data.settings[key]}">
           <span class="toggle-text"><strong>${label}</strong><small>${hint}</small></span>
           <span class="toggle-knob" aria-hidden="true"></span>
         </button>`,
    )
    .join('');
  const keys = SHORTCUTS.map(([k, what]) => `<li><kbd>${k}</kbd><span>${what}</span></li>`).join('');
  const buttons: SheetButton[] = [{ label: 'Listo', primary: true }];
  if (inGame) buttons.unshift({ label: 'Salir al menú', action: exitToMenu });
  openSheet({
    html:
      `<div class="kicker">Ajustes</div><h2>${inGame ? 'Pausa' : 'Preferencias'}</h2>` +
      `<div class="toggles">${toggles}</div>` +
      `<details class="keys"><summary>Atajos de teclado</summary><ul>${keys}</ul></details>` +
      (inGame ? '' : '<button id="btn-clear" class="link-btn danger">Borrar el progreso</button>'),
    buttons,
    onRender: (sheet) => {
      sheet.querySelectorAll<HTMLElement>('.toggle').forEach((el) => {
        el.addEventListener('click', () => {
          const key = el.dataset.setting as keyof Settings;
          const value = !store.data.settings[key];
          checkSaved(store.setSetting(key, value));
          el.setAttribute('aria-checked', String(value));
          applySettings();
          if (key === 'haptics' && value) buzz(30);
          if (key === 'sound' && value) sound.play('select');
        });
      });
      sheet.querySelector('#btn-clear')?.addEventListener('click', confirmClear);
    },
  });
}
$('btn-settings-menu').addEventListener('click', openSettings);
$('btn-settings').addEventListener('click', openSettings);

// --- Partida ----------------------------------------------------------------

function levelIntro(i: number): void {
  const level = LEVELS[i];
  openSheet({
    html:
      `<div class="kicker">Nivel ${i + 1} · ${level.tag}</div><h2>${level.title}</h2><p>${level.brief}</p>` +
      `<ul>${level.goals.map((g) => `<li>${g.label}</li>`).join('')}</ul>`,
    buttons: [{ label: 'Empezar', primary: true }],
  });
}

function startLevel(i: number): void {
  const wasInLevel = !!game;
  if (wasInLevel) saveSession(true);
  levelIndex = i;
  hintStep = 0;
  lastStars = 0;
  const level = LEVELS[i];
  const g = new Game(level, {
    toast,
    sfx,
    changed: () => {
      uiDirty = true;
      scene?.invalidate();
    },
    won: onWin,
  });
  game = g;

  // Si quedó una partida a medias de este nivel, se retoma
  const session: SessionSave | null = store.loadSession();
  let resumed = false;
  if (session && session.level === level.id) {
    resumed = g.restore(session);
    if (!resumed) store.clearSession();
  }
  savedActions = resumed ? g.actions : -1;
  activeSinceSave = false;

  menuEl.classList.add('hidden');
  playEl.classList.remove('hidden');
  toastsEl.innerHTML = '';
  if (!wasInLevel) pushBack(showMenuScreen);
  store.setLast(level.id);

  $('lvl-num').textContent = `Nivel ${i + 1} de ${LEVELS.length}`;
  $('lvl-name').textContent = level.title;
  burnerBtn.classList.toggle('hidden', !level.tools.burner);
  goalsEl.innerHTML = level.goals
    .map(() => '<li><span class="mark"></span><span class="label"></span><span class="value"></span></li>')
    .join('');
  // Lo que ya está cumplido al empezar (o al retomar) no se festeja
  goalsOk = g.results().conds.map((c) => c.ok);

  if (!scene) scene = new Scene(canvas, $<HTMLCanvasElement>('lab-bg'), g);
  else scene.setGame(g);
  scene.calm = store.data.settings.calm;
  scene.resize();
  uiDirty = true;
  refreshUi(true);

  if (resumed) toast('Retomaste el nivel donde lo habías dejado.');
  else levelIntro(i);
}

function winSheet(): void {
  const g = game;
  if (!g || !g.won) return;
  const level = g.level;
  const last = levelIndex === LEVELS.length - 1;
  const best = store.best(level.id);
  const buttons: SheetButton[] = [{ label: 'Repetir', action: restartLevel }];
  if (last) buttons.push({ label: 'Niveles', primary: true, action: exitToMenu });
  else buttons.push({ label: 'Siguiente nivel', primary: true, action: () => startLevel(levelIndex + 1) });
  openSheet({
    html:
      `<div class="kicker">¡Nivel superado!</div><h2>${level.title}</h2>` +
      `<div class="big-stars">${starsHtml(lastStars)}</div>` +
      `<p class="meta">Lo resolviste en ${g.actions} ${g.actions === 1 ? 'acción' : 'acciones'} · 3 estrellas con ${level.par} o menos` +
      (best && best < g.actions ? ` · tu mejor marca: ${best}` : '') +
      `</p><div class="kicker">¿Qué pasó?</div>${level.explain}` +
      (last ? `<p><b>Completaste los ${LEVELS.length} niveles.</b> Pronto habrá más experimentos.</p>` : ''),
    buttons,
  });
}

function onWin(stars: number): void {
  const g = game!;
  lastStars = stars;
  store.clearSession();
  checkSaved(store.recordWin(g.level.id, stars, g.actions).saved);
  setTimeout(() => {
    if (game === g && !sheetOpen()) winSheet();
  }, 900);
}

function restartLevel(): void {
  if (!game) return;
  game.reset();
  store.clearSession();
  savedActions = -1;
  hintStep = 0;
  lastStars = 0;
  goalsOk = game.results().conds.map((c) => c.ok);
  toastsEl.innerHTML = '';
}

function showHint(): void {
  if (!game || game.won) return;
  const hints = game.level.hints;
  const shown = Math.min(hintStep, hints.length - 1);
  hintStep = Math.min(shown + 1, hints.length - 1);
  openSheet({
    html:
      `<div class="kicker">Pista ${shown + 1} de ${hints.length}</div><h2>${game.level.title}</h2>` +
      `<p>${game.level.brief}</p><p><b>${hints[shown]}</b></p>`,
    buttons: [{ label: 'Cerrar', primary: true }],
  });
}

$('btn-menu').addEventListener('click', exitToMenu);
$('btn-reset').addEventListener('click', restartLevel);
$('btn-hint').addEventListener('click', showHint);
$('btn-empty').addEventListener('click', () => game?.emptySelected());
burnerBtn.addEventListener('click', () => game?.toggleBurner());
$('btn-explain').addEventListener('click', winSheet);
$('btn-next').addEventListener('click', () => {
  if (levelIndex === LEVELS.length - 1) exitToMenu();
  else startLevel(levelIndex + 1);
});

// --- Sonido -----------------------------------------------------------------

// El audio solo puede arrancar después de un gesto; cada toque lo reanuda
for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, () => sound.unlock(), { capture: true });
}
document.addEventListener('click', (e) => {
  const target = e.target as Element | null;
  if (target?.closest('button')) sound.play('tap');
});

let lastPhase = 'none';

/** Ambiente (chorro, burbujeo, hervor, mechero) y sonidos del vertido. */
function soundFrame(dt: number, running: boolean): void {
  const g = game;
  if (!g || !running) {
    sound.silence();
    lastPhase = 'none';
    return;
  }
  const p = g.pour;
  const r = p ? g.reagents[p.reagent] : null;
  const phase = p ? p.phase : 'none';
  if (phase !== lastPhase) {
    if (phase === 'pour' && r?.kind === 'dropper') sound.play('drop');
    if (phase === 'pour' && r?.kind === 'solid') sound.play('solid');
    if (phase === 'none' && lastPhase === 'back') sound.play('clink');
    lastPhase = phase;
  }
  let gas = 0;
  let boil = 0;
  let burner = 0;
  for (const v of g.vessels) {
    gas = Math.max(gas, v.gasRate);
    if (v.boiling) boil = 1;
    if (v.heating) burner = 1;
  }
  sound.ambience({
    pour: phase === 'pour' && r?.kind === 'liquid' ? 1 : 0,
    fizz: Math.min(1, gas * 700),
    boil,
    burner,
  });
  sound.update(dt);
}

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
    if (c.ok && !goalsOk[i] && !force) {
      // Recién cumplido: se marca con un saltito y un sonido
      li.className = cls;
      void li.offsetWidth;
      li.className = cls + ' pop';
      if (!g.won) sfx('goal');
    } else if (li.className.replace(' pop', '') !== cls) li.className = cls;
    goalsOk[i] = c.ok;
    setText(li.children[1], c.label);
    setText(li.children[2], c.value ?? '');
    const state = c.broken ? 'ya no se puede cumplir' : c.ok ? 'cumplido' : 'pendiente';
    if (li.dataset.state !== state) {
      li.dataset.state = state;
      li.setAttribute('aria-label', `${c.label}: ${state}`);
    }
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

  // Al ganar, los controles dejan lugar a la barra de resultado
  controlsEl.classList.toggle('won', g.won);
  if (g.won) {
    $('win-stars').innerHTML = starsHtml(lastStars);
    $('btn-next').textContent = levelIndex === LEVELS.length - 1 ? 'Niveles' : 'Siguiente';
  }

  // Estado y dosis
  const r = g.selReagent !== null ? g.reagents[g.selReagent] : null;
  if (g.won) statusEl.innerHTML = '<em>¡Objetivo cumplido!</em>';
  else if (r) {
    const target =
      g.vessels.length > 1 ? 'un recipiente' : `el ${VESSEL_NAMES[g.vessels[0].kind].split(' ')[0].toLowerCase()}`;
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
      b.setAttribute('aria-pressed', String(d === g.dose));
      if (d === g.dose) b.className = 'on';
      b.addEventListener('click', () => g.setDose(d));
      dosesEl.appendChild(b);
    }
  }
  const heating = g.vessels[g.selVessel].heating;
  burnerBtn.classList.toggle('lit', heating);
  burnerBtn.setAttribute('aria-pressed', String(heating));
  burnerBtn.lastElementChild!.textContent = heating ? 'Apagar' : 'Mechero';
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
  scene.invalidate();
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

// --- Teclado ----------------------------------------------------------------

/** Mueve la selección de recipiente salteando los tapados. */
function cycleVessel(g: Game, dir: number): void {
  const n = g.vessels.length;
  let i = g.selVessel;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (!g.isLocked(i)) break;
  }
  g.selectVessel(i);
}

document.addEventListener('keydown', (e) => {
  const g = game;
  if (!g || sheetOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  const onButton = (e.target as Element | null)?.closest('button, summary') != null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (key === 'Escape') {
    if (g.selReagent !== null) g.selectReagent(null);
    else exitToMenu();
    e.preventDefault();
    return;
  }
  if (key === 'r') {
    restartLevel();
    return;
  }
  if (g.won) return;
  if (key >= '1' && key <= '9') {
    const i = Number(key) - 1;
    if (i < g.reagents.length) g.tapReagent(i);
    return;
  }
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowRight':
      cycleVessel(g, key === 'ArrowLeft' ? -1 : 1);
      e.preventDefault();
      break;
    case 'ArrowUp':
    case 'ArrowDown': {
      const doses = g.level.doses;
      const i = doses.indexOf(g.dose) + (key === 'ArrowUp' ? 1 : -1);
      if (i >= 0 && i < doses.length) g.setDose(doses[i]);
      e.preventDefault();
      break;
    }
    case 'Enter':
    case ' ':
      // Sobre un botón, Enter y espacio son del botón
      if (onButton) return;
      if (g.selReagent !== null) g.requestPour(g.selReagent, g.selVessel, null);
      e.preventDefault();
      break;
    case 'm':
      g.toggleBurner();
      break;
    case 'v':
      g.emptySelected();
      break;
    case 'p':
      showHint();
      break;
  }
});

// --- Bucle principal --------------------------------------------------------

new ResizeObserver(() => scene?.resize()).observe(canvas);

/**
 * Resolución adaptativa: si los cuadros pintados salen lentos se baja la
 * resolución del canvas un escalón. Si bajar no mejora, el problema no eran
 * los píxeles: se vuelve atrás y no se insiste.
 */
const QUALITY_STEPS = [1, 0.8, 0.64];
const adapt = { step: 0, sum: 0, n: 0, before: 0, locked: false };
function trackFrameTime(interval: number): void {
  if (adapt.locked || interval > 100) return;
  adapt.sum += interval;
  if (++adapt.n < 45) return;
  const avg = adapt.sum / adapt.n;
  adapt.sum = 0;
  adapt.n = 0;
  if (adapt.before > 0) {
    // Recién se bajó un escalón: ¿sirvió?
    if (avg > adapt.before * 0.9) {
      adapt.step--;
      adapt.locked = true;
      scene?.setQuality(QUALITY_STEPS[adapt.step]);
    }
    adapt.before = 0;
    return;
  }
  if (avg > 22 && adapt.step < QUALITY_STEPS.length - 1) {
    adapt.before = avg;
    adapt.step++;
    scene?.setQuality(QUALITY_STEPS[adapt.step]);
  }
}

let last = performance.now();
let saveTimer = 0;
function frame(now: number): void {
  const interval = now - last;
  const dt = Math.min(0.05, interval / 1000);
  last = now;
  const playing = !!game && !!scene && !playEl.classList.contains('hidden');
  // Con un cartel abierto la química queda en pausa
  const running = playing && (!sheetOpen() || game!.won);
  soundFrame(dt, running);
  if (game && scene && playing) {
    const t0 = performance.now();
    if (running) game.update(dt);
    const t1 = performance.now();
    if (running) scene.update(dt);
    const t2 = performance.now();
    if (scene.shouldDraw(running)) {
      scene.draw();
      trackFrameTime(interval);
    }
    const t3 = performance.now();
    const busy = running && scene.isBusy();
    if (busy) activeSinceSave = true;
    uiTimer += dt;
    // Los instrumentos solo se actualizan mientras algo esté cambiando
    if (uiDirty || (busy && uiTimer > 0.1)) {
      uiTimer = 0;
      refreshUi();
    }
    saveTimer += dt;
    if (saveTimer > 3) {
      saveTimer = 0;
      saveSession();
    }
    perf.record(interval, t1 - t0, t2 - t1, t3 - t2, performance.now() - t3);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Al mandar la página a segundo plano (o cerrarla) se guarda la partida
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveSession(true);
});
window.addEventListener('pagehide', () => saveSession(true));

applySettings();
renderMenu();

// Acceso para pruebas automáticas y para curiosear desde la consola
declare global {
  interface Window {
    lab?: {
      game: () => Game | null;
      start: (i: number) => void;
      sound: Sound;
      perf: PerfProbe;
      store: SaveStore;
      quality: () => number;
    };
  }
}
window.lab = { game: () => game, start: startLevel, sound, perf, store, quality: () => QUALITY_STEPS[adapt.step] };
