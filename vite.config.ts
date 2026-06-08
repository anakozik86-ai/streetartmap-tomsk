import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Базовый путь: '/' в dev, '/streetartmap-tomsk/' (или иное) в проде GitHub Pages.
  // Контролируется переменной VITE_BASE_PATH в .github/workflows/deploy.yml.
  base: process.env.VITE_BASE_PATH ?? '/',

  plugins: [
    preact(),
    viteStaticCopy({
      // data/ и images/ лежат в корне репо как первоисточник;
      // для прода их надо положить в dist рядом с index.html, чтобы
      // публичная страница могла их fetch'ить.
      targets: [
        { src: 'data', dest: '' },
        { src: 'images', dest: '' },
      ],
    }),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@public': resolve(__dirname, 'src/public'),
      '@admin': resolve(__dirname, 'src/admin'),
    },
  },

  // LRM поставляется как CommonJS без ESM — без этого в dev режиме ошибка импорта
  optimizeDeps: {
    include: ['leaflet-routing-machine'],
  },

  // static/ — пасс-зрю папка для favicon, og-image, robots.txt
  publicDir: 'static',

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // Прод без сорсмапов: не отдаём исходники и не раздуваем артефакт Pages.
    // Для отладки прод-сборки временно поставить 'hidden'.
    sourcemap: false,
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    open: '/',
  },
});
