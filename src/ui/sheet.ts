/**
 * Hojas modales: un cartel que sube desde abajo (o centrado en pantallas
 * anchas). Se ocupan de lo que hace usable un diálogo sin mouse: foco inicial
 * en el botón principal, Tab que no se escapa de la hoja, Escape y "atrás"
 * para cerrar, y devolver el foco a donde estaba.
 */
import { popBack, pushBack } from './nav';

export interface SheetButton {
  label: string;
  primary?: boolean;
  action?: () => void;
}

export interface SheetOptions {
  html: string;
  buttons: SheetButton[];
  /** Se cerró sin elegir un botón (atrás, Escape o tocando afuera) */
  onDismiss?: () => void;
  /** Para conectar controles propios del contenido */
  onRender?: (sheet: HTMLElement) => void;
}

let host: HTMLElement;
let open = false;
/** Lo que hay que hacer al terminar de cerrar la hoja actual */
let afterClose: (() => void) | undefined;
let opener: Element | null = null;
const listeners: (() => void)[] = [];

export function initSheets(modal: HTMLElement): void {
  host = modal;
  host.addEventListener('click', (e) => {
    if (e.target === host) dismiss();
  });
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      // Que el mismo Escape no llegue además a los atajos del juego
      e.stopImmediatePropagation();
      dismiss();
      return;
    }
    if (e.key !== 'Tab') return;
    // El foco da la vuelta dentro de la hoja
    const items = [...host.querySelectorAll<HTMLElement>('button, [href], summary')].filter(
      (el) => !el.hasAttribute('disabled'),
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !host.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !host.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  });
}

export function sheetOpen(): boolean {
  return open;
}

/** Avisa cuando se abre o se cierra una hoja. */
export function onSheetChange(fn: () => void): void {
  listeners.push(fn);
}

function teardown(): void {
  open = false;
  host.classList.add('hidden');
  host.innerHTML = '';
  if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
  opener = null;
  const next = afterClose;
  afterClose = undefined;
  for (const fn of listeners) fn();
  next?.();
}

/** Cierra la hoja abierta y ejecuta `then` (si hay) cuando ya no está. */
export function closeSheet(then?: () => void): void {
  if (!open) {
    then?.();
    return;
  }
  afterClose = then;
  popBack();
}

function dismiss(): void {
  if (open) popBack();
}

export function openSheet(opts: SheetOptions): void {
  if (open) {
    closeSheet(() => openSheet(opts));
    return;
  }
  open = true;
  opener = document.activeElement;
  host.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${opts.html}<div class="sheet-actions"></div></div>`;
  const sheet = host.firstElementChild as HTMLElement;
  const row = sheet.querySelector('.sheet-actions')!;
  let focusTarget: HTMLElement | null = null;
  for (const b of opts.buttons) {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '');
    el.textContent = b.label;
    el.addEventListener('click', () => closeSheet(b.action));
    row.appendChild(el);
    if (b.primary || !focusTarget) focusTarget = el;
  }
  const heading = sheet.querySelector('h2');
  if (heading) {
    heading.id = 'sheet-title';
    sheet.setAttribute('aria-labelledby', 'sheet-title');
  }
  opts.onRender?.(sheet);
  afterClose = opts.onDismiss;
  pushBack(teardown);
  host.classList.remove('hidden');
  focusTarget?.focus({ preventScroll: true });
  for (const fn of listeners) fn();
}
