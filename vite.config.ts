import { defineConfig } from 'vite';

// base relativa: el build funciona en cualquier subcarpeta (GitHub Pages, etc.)
export default defineConfig({
  base: './',
});
