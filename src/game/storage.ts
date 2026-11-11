import { LEVELS } from './levels';

const KEY = 'laboratorio-quimico.v1';

export interface Progress {
  /** Estrellas obtenidas por id de nivel */
  stars: Record<string, number>;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Progress>;
      if (data && typeof data.stars === 'object' && data.stars) {
        const stars: Record<string, number> = {};
        for (const l of LEVELS) {
          const s = Number((data.stars as Record<string, unknown>)[l.id]);
          if (s >= 1 && s <= 3) stars[l.id] = Math.floor(s);
        }
        return { stars };
      }
    }
  } catch {
    // localStorage bloqueado o datos corruptos: se empieza de cero
  }
  return { stars: {} };
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // sin almacenamiento disponible: el progreso dura lo que dure la sesión
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada que borrar
  }
}

export function isUnlocked(p: Progress, index: number): boolean {
  return index === 0 || (p.stars[LEVELS[index - 1].id] ?? 0) > 0;
}
