/**
 * Общая инициализация Leaflet-карты — используется на публичной странице
 * (MapView) и в админ-редакторе маршрутов (RouteForm).
 *
 * Цель: визуальная и поведенческая идентичность. Тайлы, attribution, zoom
 * controls, smoothWheelZoom, bounds — всё в одном месте.
 */
import L from 'leaflet';
import { addProtocol } from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet'; // регистрирует L.maplibreGL
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
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

// ── Векторная подложка под буклет (только публичная карта) ──────────────────
// Self-host: тайлы в static/tiles/tomsk.pmtiles → ${BASE_URL}tiles/tomsk.pmtiles.
// api.protomaps.com отдаёт только IPv6 и в РФ часто недоступен, поэтому тайлы
// раздаём со своего origin, а протокол pmtiles:// регистрируем разово.
const PMTILES_URL = `pmtiles://${import.meta.env.BASE_URL}tiles/tomsk.pmtiles`;

// Шрифты и спрайты Protomaps — с jsDelivr (доступен по IPv4, в отличие от
// api.protomaps.com). @main без тегов; при желании можно запинить на commit.
const ASSETS_BASE = 'https://cdn.jsdelivr.net/gh/protomaps/basemaps-assets@main';
const GLYPHS_URL = `${ASSETS_BASE}/fonts/{fontstack}/{range}.pbf`;
const SPRITE_URL: Record<MapTheme, string> = {
  dark: `${ASSETS_BASE}/sprites/v4/black`,
  light: `${ASSETS_BASE}/sprites/v4/white`,
};

// Протокол pmtiles:// — один раз на модуль. try/catch — на случай HMR.
let pmtilesRegistered = false;
function ensurePmtilesProtocol(): void {
  if (pmtilesRegistered) return;
  pmtilesRegistered = true;
  try {
    addProtocol('pmtiles', new Protocol().tile);
  } catch {
    // уже зарегистрирован — игнорируем
  }
}

// Палитра под буклет. Принцип: подложка нейтральная и приглушённая, а лаймовый
// #b8ff3d отдан ТОЛЬКО линии маршрута (Leaflet SVG поверх GL-canvas) — чтобы он
// не конкурировал по тону с дорогами. Дороги обесцвечены (тёплый тёмно/светло-серый),
// вода/парки слегка зелёные для идентичности. Всё тюнится здесь.

// Тёмная: чёрная база, дороги нейтрально-серые и тусклые.
function darkFlavor() {
  return {
    ...namedFlavor('black'),
    background: '#161a12',
    earth: '#2b3324',
    water: '#6fa04a', // приглушённый зелёный в нашей гамме
    park_a: '#314d2c',
    park_b: '#314d2c',
    wood_a: '#314d2c',
    wood_b: '#314d2c',
    scrub_a: '#314d2c',
    scrub_b: '#314d2c',
    buildings: '#3a4330',
    // Дороги чёрные — резкий контраст на тёмно-зелёной земле
    minor_service: '#000000',
    pedestrian: '#000000',
    other: '#000000',
    minor_a: '#000000',
    minor_b: '#000000',
    link: '#000000',
    major: '#000000',
    highway: '#000000',
    roads_label_major: '#cccccc',
    roads_label_minor: '#b4b4b4',
    address_label: '#8a8a8a',
    city_label: '#d2d2d2',
    subplace_label: '#a6a6a6',
  };
}

// Светлая: шалфейная зелёная гамма (приглушённый серо-зелёный), как тёмная — но
// светлая. Фон/земля/здания/дороги с зелёным подтоном, вода/парки насыщеннее.
function lightFlavor() {
  return {
    ...namedFlavor('white'),
    // Свежая зелёная гамма: чуть ярче и контрастнее шалфея, но мягкая.
    // Земля — зелёный крем, дороги почти белые (читаемая сеть), парки/вода
    // насыщеннее для живости, подписи темнее для контраста.
    background: '#e9f0df',
    earth: '#e9f0df',
    water: '#b2d1bb',
    park_a: '#cce1b8',
    park_b: '#cce1b8',
    wood_a: '#c1d7ad',
    wood_b: '#c1d7ad',
    scrub_a: '#d4e3c5',
    scrub_b: '#d4e3c5',
    buildings: '#dfe6d0',
    minor_service: '#f1f5ea',
    pedestrian: '#f1f5ea',
    other: '#f1f5ea',
    minor_a: '#f1f5ea',
    minor_b: '#f1f5ea',
    link: '#eef3e4',
    major: '#f5f8ef',
    highway: '#f8faf3',
    // Подписи — тёмно-зелёные, обводка из namedFlavor('white') (светлая).
    roads_label_major: '#2b3925',
    roads_label_minor: '#3b4c34',
    address_label: '#515f48',
    city_label: '#2b3925',
    subplace_label: '#3b4c34',
  };
}

type StyleLayer = ReturnType<typeof layers>[number];

/**
 * Точечная подстройка слоёв подписей поверх стандартного набора Protomaps:
 *  - номера домов (address_label): крупнее и видны с z16 (а не z18), шрифт Regular;
 *  - имена жилых улиц (roads_labels_minor): появляются с z13 и крупнее;
 *  - магистрали (roads_labels_major): чуть крупнее.
 * Цвета подписей задаются во flavor (dark/lightFlavor), здесь — только геометрия.
 */
function tuneLabelLayers(input: StyleLayer[], theme: MapTheme): StyleLayer[] {
  // Однострочная подпись: только русское (или дефолтное) имя. Заменяет
  // дефолтный двухстрочный `format` Protomaps (lang:'ru'), который при
  // равенстве name:ru === name печатал имя дважды («Томск II / Томск II»).
  // Если имя содержит «дублёр» — возвращаем пустую строку, иначе русское/дефолтное имя.
  // Это expression-стиль: не трогает layer.filter (который у Protomaps legacy-формат).
  const SINGLE_LINE = [
    'case',
    ['>', ['index-of', 'дублёр', ['downcase', ['coalesce', ['get', 'name:ru'], ['get', 'name'], '']]], -1],
    '',
    ['coalesce', ['get', 'name:ru'], ['get', 'name']],
  ] as unknown as string;

  // Единый цвет всего текста — одинаковый для всех подписей в теме.
  const TEXT_COLOR = theme === 'dark' ? '#cccccc' : '#2b3925';

  // Водный слой — по ID (содержит 'water') или по source-layer 'water'.
  // Охватывает все варианты Protomaps: water_name, water_label, ocean_label и т.д.
  const isWaterLayer = (l: StyleLayer) =>
    l.id.includes('water') || ('source-layer' in l && (l as { 'source-layer'?: string })['source-layer'] === 'water');

  const tuned = input.map((l): StyleLayer => {
    if (l.type !== 'symbol') return l;

    // Базовый минималистичный вид: убираем обводку, единый шрифт, единый цвет,
    // скрываем icon (road shields) чтобы не было чёрных прямоугольников.
    const baseLayout: Record<string, unknown> = {
      ...l.layout,
      'text-font': ['Noto Sans Regular'],
    };
    const basePaint: Record<string, unknown> = {
      ...l.paint,
      'text-color': TEXT_COLOR,
      'text-halo-width': 0,
      'text-halo-color': 'rgba(0,0,0,0)',
      'icon-opacity': 0,
    };

    // Текст на воде — тот же цвет, что у остальных подписей.
    if (isWaterLayer(l)) {
      return {
        ...l,
        layout: { ...baseLayout, 'text-field': SINGLE_LINE },
        paint: basePaint,
      } as StyleLayer;
    }

    // Номера домов — отдельное поле (addr_housenumber), text-field не трогаем.
    if (l.id === 'address_label') {
      return {
        ...l,
        minzoom: 16,
        layout: {
          ...baseLayout,
          'text-size': ['interpolate', ['linear'], ['zoom'], 16, 11, 18, 14, 20, 17],
          'text-anchor': 'center',
          'symbol-placement': 'point',
        },
        paint: basePaint,
      } as StyleLayer;
    }
    if (l.id === 'roads_labels_minor') {
      return {
        ...l,
        minzoom: 13,
        layout: {
          ...baseLayout,
          'text-field': SINGLE_LINE,
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 16, 13, 19, 15],
        },
        paint: basePaint,
      } as StyleLayer;
    }
    if (l.id === 'roads_labels_major') {
      return {
        ...l,
        layout: {
          ...baseLayout,
          'text-field': SINGLE_LINE,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 12, 16, 14],
        },
        paint: basePaint,
      } as StyleLayer;
    }
    // Прочие подписи (места, города, районы) — одна строка, без обводки.
    return {
      ...l,
      layout: { ...baseLayout, 'text-field': SINGLE_LINE },
      paint: basePaint,
    } as StyleLayer;
  });

  // Номера домов — наименьший приоритет: имена улиц/мест выигрывают коллизии.
  // MapLibre размещает подписи в порядке слоёв (раньше в массиве = выше приоритет),
  // поэтому сдвигаем address_label в конец массива.
  const idx = tuned.findIndex((l) => l.id === 'address_label');
  if (idx >= 0) tuned.push(tuned.splice(idx, 1)[0]!);
  return tuned;
}

function bookletStyle(theme: MapTheme) {
  const flavor = theme === 'dark' ? darkFlavor() : lightFlavor();
  return {
    version: 8 as const,
    glyphs: GLYPHS_URL,
    sprite: SPRITE_URL[theme],
    sources: {
      protomaps: {
        type: 'vector' as const,
        url: PMTILES_URL,
        attribution: '© OpenStreetMap',
      },
    },
    // Полный набор слоёв Protomaps, включая подписи (symbol). lang: 'ru' —
    // русские названия улиц и мест там, где они есть в OSM.
    // tuneLabelLayers — размеры/minzoom/приоритет номеров и улиц.
    layers: tuneLabelLayers(layers('protomaps', flavor, { lang: 'ru' }), theme),
  };
}

// Публичная карта — MapLibre GL (вектор, self-host pmtiles).
// createTileLayer/TILE_LAYERS остаются для admin-редактора маршрутов (RouteForm).
export function createBasemapLayer(theme: MapTheme): L.Layer {
  ensurePmtilesProtocol();
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
  control.onAdd = (map) => {
    const container = L.DomUtil.create('div', 'attribution-pill');
    container.setAttribute('aria-label', 'Источники карты');

    const icon = L.DomUtil.create('span', 'attribution-pill__icon', container);
    icon.textContent = 'i';
    icon.setAttribute('aria-hidden', 'true');

    const content = L.DomUtil.create('span', 'attribution-pill__content', container);
    // Публичная карта: self-host векторные тайлы Protomaps поверх данных OSM.
    content.innerHTML =
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>' +
      ', ' +
      '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';

    L.DomEvent.on(container, 'click', (e) => {
      L.DomEvent.stopPropagation(e);
      container.classList.toggle('is-open');
    });

    // Закрытие при клике вне пилюли. Слушатель снимаем на unload карты
    // (Leaflet вызывает fire('unload') в map.remove()) — иначе утечёт при ремаунте.
    const onDocClick = () => container.classList.remove('is-open');
    document.addEventListener('click', onDocClick);
    map.once('unload', () => document.removeEventListener('click', onDocClick));

    L.DomEvent.disableScrollPropagation(container);
    return container;
  };
  return control;
}
