/**
 * Общая инициализация Leaflet-карты — используется на публичной странице
 * (MapView) и в админ-редакторе маршрутов (RouteForm).
 *
 * Цель: визуальная и поведенческая идентичность. Тайлы, attribution, zoom
 * controls, smoothWheelZoom, bounds — всё в одном месте.
 */
import L from 'leaflet';
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
  });
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
      '<a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

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
