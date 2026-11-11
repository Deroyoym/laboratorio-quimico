# Laboratorio Químico

Juego web de puzzles en un laboratorio de química, pensado para jugar en el
celular. Hay una mesada con reactivos y material de vidrio; al mezclar, las
reacciones se ven: cambia el color, burbujea el gas, cae el precipitado y sube
o baja la temperatura. Cada nivel pide lograr algo concreto.

Vite + TypeScript + Canvas, sin backend. El progreso se guarda en
`localStorage`.

## Cómo correrlo

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # tests del motor químico y de los niveles
npm run build    # typecheck + build de producción en dist/
```

Para probarlo desde el teléfono en la misma red: `npm run dev -- --host` y
abrir la dirección que muestra Vite.

## Cómo se juega

- Tocá un envase de la estantería y después un recipiente para verter una
  dosis; también se puede arrastrar el envase hasta el recipiente.
- Abajo se elige la dosis en mL. Goteros y sólidos tienen dosis fija.
- «Vaciar» enjuaga el recipiente elegido; el botón de arriba a la derecha
  reinicia el nivel; «Pista» da ayudas de a una.
- Se gana cuando un mismo recipiente cumple todos los objetivos. Las estrellas
  dependen de la cantidad de acciones.

## Niveles

| # | Nivel | Qué se trabaja |
|---|-------|----------------|
| 1 | Primer viraje | Indicador ácido-base (fenolftaleína) |
| 2 | Neutralización exacta | Estequiometría, pH y calor de neutralización |
| 3 | Lluvia de oro | Precipitación de PbI₂ y pureza del sólido |
| 4 | Hidrógeno bajo control | Metal + ácido, gas y control de temperatura |
| 5 | Del celeste al negro | Cu(OH)₂ → CuO con el mechero |

## Cómo está armado

```
src/
  chem/     motor químico, sin nada de interfaz
    species.ts    especies: color (absorbancia), sólidos, masas molares
    reagents.ts   envases de la estantería y su contenido
    engine.ts     recipiente, reacciones, calor, color del líquido
  game/
    levels.ts     definición de los niveles
    goals.ts      condiciones de victoria
    game.ts       estado de la partida, vertidos, estrellas
    storage.ts    progreso en localStorage
  render/
    glass.ts      geometría del material de vidrio
    scene.ts      dibujo en canvas y partículas
  main.ts         menú, HUD y entrada táctil
tests/            soluciones de cada nivel jugadas contra el motor
```

### El modelo químico

Cada recipiente guarda moles por especie, volumen y temperatura. En cada paso:

1. **Neutralización** H⁺ + OH⁻ → H₂O, con su calor (−55,8 kJ/mol). El pH sale
   del exceso de ácido o base más la autoionización del agua.
2. **Precipitación por Kps**: para cada sal poco soluble se resuelve el
   equilibrio, así que el sólido aparece al superar el producto de solubilidad
   y se redisuelve al diluir o al acidificar.
3. **Reacciones con velocidad**: metal + ácido (según superficie, [H⁺] y
   temperatura), deshidratación del Cu(OH)₂ en caliente.
4. **Calor**: entalpías de reacción, mechero, enfriamiento hacia el ambiente y
   ebullición con evaporación.

El color del líquido se calcula con Beer–Lambert a partir de las especies
disueltas, por eso diluir aclara. Los indicadores cambian su absorbancia con
el pH.

Los datos (Kps, ΔH, masas molares) son reales. Lo que está simplificado: la
escala de tiempo está comprimida para que todo pase en segundos, los volúmenes
se suman sin corrección y cada nivel ofrece solo reactivos cuyas combinaciones
están modeladas.

### Agregar un nivel

Sumar una entrada en `src/game/levels.ts` (reactivos, recipientes, objetivos,
pistas) y un test en `tests/levels.test.ts` que juegue la solución. Si hace
falta un reactivo o una reacción nueva, van en `src/chem/`.
