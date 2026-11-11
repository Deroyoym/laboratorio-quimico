/**
 * Pila de pantallas atada al historial del navegador.
 *
 * Cada pantalla u hoja que se abre apila una función "volver". El botón atrás
 * del teléfono (o del navegador) desapila la de arriba, igual que el botón
 * atrás de la interfaz: así "atrás" cierra la hoja o sale del nivel en vez de
 * abandonar el juego.
 */
type Handler = () => void;

const stack: Handler[] = [];
/** Vueltas de historial que disparamos nosotros y no hay que volver a atender */
let ignore = 0;

export function initNav(): void {
  history.replaceState({ lab: 0 }, '');
  window.addEventListener('popstate', () => {
    if (ignore > 0) {
      ignore--;
      return;
    }
    stack.pop()?.();
  });
}

/** Abre un nivel de navegación; `onBack` se llama al volver. */
export function pushBack(onBack: Handler): void {
  stack.push(onBack);
  history.pushState({ lab: stack.length }, '');
}

/** Vuelve un nivel, como si se hubiera tocado "atrás". */
export function popBack(): void {
  const handler = stack.pop();
  if (!handler) return;
  ignore++;
  history.back();
  handler();
}

export function navDepth(): number {
  return stack.length;
}
