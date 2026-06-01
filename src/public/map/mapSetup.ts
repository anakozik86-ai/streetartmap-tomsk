/**
 * Общая инициализация Leaflet-карты — используется на публичной странице
 * (MapView) и в админ-редакторе маршрутов (RouteForm).
 *
 * Цель: визуальная и поведенческая идентичность. Тайлы, attribution, zoom
 * controls, smoothWheelZoom, bounds — всё в одном месте.
 */
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet'; // регистрирует L.maplibreGL
import 'maplibre-gl/dist/maplibre-gl.css';
import { layers, namedFlavor } from '@protomaps/basemaps';
import '../components/SmoothWheelZoom.ts'; // регистрирует L.Map handler smoothWheelZoom

export type MapTheme = 'light' | 'dark';

interface TileConfig {
  url: string;
  subdomains: string;
  maxZoom: number;
}

export const TILE_LAYERS: Record<MapTheme, TileConfig> = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 19,
  },
};

export function createTileLayer(theme: MapTheme): L.TileLayer {
  const cfg = TILE_LAYERS[theme];
  return L.tileLayer(cfg.url, {
    subdomains: cfg.subdomains,
    maxZoom: cfg.maxZoom,
    keepBuffer: 6,
    updateWhenIdle: false,
    updateWhenZooming: true,
    // {r} в URL → '@2x' suffix при HiDPI экранах и при печати в PDF.
    // На retina-дисплеях даёт чёткую карту; на принтере — половина DPI,
    // но это всё ещё лучше чем 1x тайлы.
    detectRetina: true,
  });
}

// ── Vector basemap под буклет (только публичная карта) ──────────────────────
// dark = MapLibre GL (WebGL, плавно) через maplibre-gl-leaflet; light = CartoDB raster.
//
// Тайлы Protomaps. Два режима источника:
//   1) API: бесплатный ключ VITE_PROTOMAPS_KEY в .env (лимиты free-tier, ключ в бандле).
//   2) Self-host .pmtiles: НЕ просто URL — для MapLibre надо зарегать протокол
//      pmtiles:// (lib `pmtiles`: maplibregl.addProtocol('pmtiles', p.tile)),
//      затем source.url = 'pmtiles://${BASE_URL}tiles/tomsk.pmtiles'. См. docs.protomaps.com/pmtiles/maplibre.
const TILES_URL = `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=${import.meta.env.VITE_PROTOMAPS_KEY}`;

// Палитра под буклет. Принцип: подложка нейтральная и приглушённая, а лаймовый
// #b8ff3d отдан ТОЛЬКО линии маршрута (Leaflet SVG поверх GL-canvas) — чтобы он
// не конкурировал по тону с дорогами. Дороги обесцвечены (тёплый тёмно/светло-серый),
// вода/парки слегка зелёные для идентичности. Всё тюнится здесь.

// Тёмная: чёрная база, дороги нейтрально-серые и тусклые.
function darkFlavor() {
  return {
    ...namedFlavor('black'),
    background: '#000000',
    earth: '#0d0f0c',
    water: '#15302a', // тёмный приглушённый teal-green — река читается, но не спорит
    park_a: '#10210f',
    park_b: '#10210f',
    wood_a: '#10210f',
    wood_b: '#10210f',
    scrub_a: '#10210f',
    scrub_b: '#10210f',
    buildings: '#14160f',
    // дороги — нейтральный тёплый серый, иерархия едва читается яркостью
    minor_service: '#1e2118',
    pedestrian: '#22251c',
    other: '#1e2118',
    minor_a: '#24271e',
    minor_b: '#24271e',
    link: '#2b2f23',
    major: '#34382b',
    highway: '#3e4330',
  };
}

// Светлая: тёплая бумага, зелёные вода/парки, дороги нейтральные.
function lightFlavor() {
  return {
    ...namedFlavor('white'),
    background: '#f3f1e9',
    earth: '#f3f1e9',
    water: '#cbe0d2',
    park_a: '#dfeacf',
    park_b: '#dfeacf',
    wood_a: '#d8e6c8',
    wood_b: '#d8e6c8',
    scrub_a: '#e3edd6',
    scrub_b: '#e3edd6',
    buildings: '#e7e4d6',
    minor_service: '#ece9db',
    pedestrian: '#ece9db',
    other: '#ece9db',
    minor_a: '#e6e3d4',
    minor_b: '#e6e3d4',
    link: '#ddd8c6',
    major: '#d6d1be',
    highway: '#cbc5af',
  };
}

function bookletStyle(theme: MapTheme) {
  const flavor = theme === 'dark' ? darkFlavor() : lightFlavor();
  return {
    version: 8 as const,
    sources: {
      protomaps: {
        type: 'vector' as const,
        tiles: [TILES_URL],
        maxzoom: 15,
        attribution: '© OpenStreetMap, Protomaps',
      },
    },
    // layers() из @protomaps/basemaps строит полный набор слоёв из flavor;
    // выкидываем все symbol-слои → ноль подписей/шилдов/иконок (на обеих темах).
    layers: layers('protomaps', flavor, { lang: 'en' }).filter((l) => l.type !== 'symbol'),
  };
}

// Обе темы теперь на MapLibre GL (WebGL). createTileLayer/TILE_LAYERS остаются
// только для admin-редактора маршрутов (RouteForm), его не трогаем.
export function createBasemapLayer(theme: MapTheme): L.Layer {
  // preserveDrawingBuffer пробрасывается в конструктор MapLibre Map, но отсутствует
  // в типах LeafletMaplibreGLOptions → каст. Без него WebGL-canvas печатается
  // пустым в Ctrl+P → PDF. style оставляем типизированным в самом литерале.
  const options = {
    style: bookletStyle(theme),
    preserveDrawingBuffer: true,
  };
  return L.maplibreGL(options as Parameters<typeof L.maplibreGL>[0]) as unknown as L.Layer;
}

/**
 * Сворачиваемая «пилюля» с источниками карты. Tap-toggle на тач-устройствах.
 * Стили — в `src/public/styles/map.css` (`.attribution-pill`, `__icon`, `__content`).
 */
export function createAttributionControl(): L.Control {
  const control = new L.Control({ position: 'bottomleft' });
  control.onAdd = () => {
    const container = L.DomUtil.create('div', 'attribution-pill');
    container.setAttribute('aria-label', 'Источники карты');

    const icon = L.DomUtil.create('span', 'attribution-pill__icon', container);
    icon.textContent = 'i';
    icon.setAttribute('aria-hidden', 'true');

    const content = L.DomUtil.create('span', 'attribution-pill__content', container);
    content.innerHTML =
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>' +
      ', ' +
      '<a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' +
      ', ' +
      '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';

    L.DomEvent.on(container, 'click', (e) => {
      L.DomEvent.stopPropagation(e);
      container.classList.toggle('is-open');
    });

    document.addEventListener('click', () => {
      container.classList.remove('is-open');
    });

    L.DomEvent.disableScrollPropagation(container);
    return container;
  };
  return control;
}
