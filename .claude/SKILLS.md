# Skills del proyecto

Las carpetas de `.claude/skills/` son skills para agentes de código: guías
que el agente carga solo cuando el pedido trata de ese tema.

## Origen

Copiadas sin cambios de
[gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills),
commit `dcf3bbbb83f365632402c086bf595048aa24aaa8`, bajo licencia Apache 2.0. La licencia y el aviso de
atribución están en `.claude/licenses/gamedev-skills/`.

## Cuáles hay

| Skill | Para qué |
|-------|----------|
| `puzzle` | Estructura de un juego de puzzles: estado, reglas, puntaje, deshacer |
| `level-design` | Ritmo y dificultad de los niveles |
| `game-feel` | Respuesta a cada acción: animación, sacudidas, feedback en capas |
| `audio-design` | Mezcla, variación de efectos y música adaptativa |
| `game-ui-ux` | HUD y menús que se adapten a cualquier pantalla |
| `input-systems` | Entrada táctil, teclado y gamepad, accesibilidad |
| `performance-optimization` | Medir antes de optimizar: presupuesto por cuadro |
| `save-systems` | Guardado con versión y migración |

El catálogo original tiene 77 skills. El resto es para motores que este juego
no usa (Godot, Unity, Unreal, Roblox, Phaser…) o para tareas que todavía no
hacen falta. Tampoco se instaló su `router`: sirve para elegir entre motores
y acá el motor es uno solo, propio, en Canvas 2D.

Los ejemplos de código de estas skills están en GDScript, C# o Python. Sirven
como idea: hay que llevarlos a TypeScript y a la estructura de `src/`.

## Dónde se usaron

- `performance-optimization`: medir primero. De ahí salieron el medidor de
  `src/perf.ts` y los cambios de dibujo (capas, caché, resolución adaptativa).
- `save-systems`: versión y migraciones, copia de respaldo, validación al
  cargar y autoguardado en una clave aparte (`src/game/storage.ts`).
- `game-ui-ux`: pila de pantallas, foco en los diálogos, uso con teclado,
  márgenes seguros y diseño para pantallas anchas (`src/ui/`, `src/main.ts`).

## Actualizar o sumar otra

Copiar la carpeta de la skill desde el repo de origen a `.claude/skills/` y
anotar acá el commit nuevo.
