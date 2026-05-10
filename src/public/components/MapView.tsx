import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import L from 'leaflet';
import { effectiveTheme, type EffectiveTheme } from '../hooks/useTheme.ts';
import { loadConfig } from '@shared/utils/loadConfig.ts';
import {
  loadCategories,
  loadCollections,
  loadPoints,
} from '@shared/utils/loadData.ts';
import type { Category, Collection, Point } from '@shared/types/index.ts';
import { createPointIcon, isLost } from '../markers/createMarker.ts';

interface TileConfig {
  url: string;
  subdomains: string;
  maxZoom: number;
}

const TILE_LAYERS: Record<EffectiveTheme, TileConfig> = {
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

function createTileLayer(theme: EffectiveTheme): L.TileLayer {
  const cfg = TILE_LAYERS[theme];
  return L.tileLayer(cfg.url, {
    subdomains: cfg.subdomains,
    maxZoom: cfg.maxZoom,
    // Без `attribution` — атрибуцию рендерим своим контролом ниже.
  });
}

/**
 * Кастомный контрол атрибуции: круглая иконка `i`, при наведении
 * раскрывается в пилюлю со ссылками на OSM и CARTO (требование лицензий).
 */
function createAttributionControl(): L.Control {
  const control = new L.Control({ position: 'bottomleft' });
  control.onAdd = () => {
    const container = L.DomUtil.create('div', 'attribution-pill');
    container.setAttribute('aria-label', 'Источники карты');

    const icon = L.DomUtil.create('span', 'attribution-pill__icon', container);
    icon.textContent = 'i';
    icon.setAttribute('aria-hidden', 'true');

    const content = L.DomUtil.create('span', 'attribution-pill__content', container);
    content.innerHTML =
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' +
      ', ' +
      '<a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  };
  return control;
}

/**
 * Создаёт LayerGroup с маркерами всех «видимых» точек и добавляет на карту.
 * Видимые на 5b: status=published, не утраченные (painted_over/removed),
 * категория существует и активна.
 */
function renderMarkers(
  map: L.Map,
  points: Point[],
  categories: Category[],
  collections: Collection[],
  opts: { maxVisibleColors: number },
): L.LayerGroup {
  const categoryById = new Map<string, Category>(
    categories.filter((c) => c.status === 'active').map((c) => [c.id, c]),
  );
  const collectionById = new Map<string, Collection>(collections.map((c) => [c.id, c]));

  const layer = L.layerGroup();

  for (const point of points) {
    if (point.status !== 'published') continue;
    if (isLost(point)) continue;

    const icon = createPointIcon(point, {
      categoryById,
      collectionById,
      maxVisibleColors: opts.maxVisibleColors,
    });
    if (!icon) continue;

    L.marker([point.coords.lat, point.coords.lng], {
      icon,
      title: point.title,
      alt: point.title,
      riseOnHover: true,
      keyboard: true,
    }).addTo(layer);
  }

  layer.addTo(map);
  return layer;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: L.Map | null = null;
    let tileLayer: L.TileLayer | null = null;
    let markersLayer: L.LayerGroup | null = null;
    let disposeThemeEffect: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const [config, categories, collections, points] = await Promise.all([
        loadConfig(),
        loadCategories(),
        loadCollections(),
        loadPoints(),
      ]);
      if (cancelled) return;

      const bounds = config.city.bounds
        ? L.latLngBounds(
            [config.city.bounds.sw.lat, config.city.bounds.sw.lng],
            [config.city.bounds.ne.lat, config.city.bounds.ne.lng],
          )
        : undefined;

      map = L.map(container, {
        center: [config.city.center.lat, config.city.center.lng],
        zoom: config.city.default_zoom,
        zoomControl: false,
        attributionControl: false,
        ...(bounds ? { maxBounds: bounds, maxBoundsViscosity: 1.0 } : {}),
        minZoom: 11,
      });

      createAttributionControl().addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      tileLayer = createTileLayer(effectiveTheme.value);
      tileLayer.addTo(map);

      markersLayer = renderMarkers(map, points, categories, collections, {
        maxVisibleColors: config.features.max_visible_collection_colors,
      });

      disposeThemeEffect = effect(() => {
        const theme = effectiveTheme.value;
        if (!map) return;
        if (tileLayer) {
          map.removeLayer(tileLayer);
        }
        tileLayer = createTileLayer(theme);
        tileLayer.addTo(map);
      });
    })();

    return () => {
      cancelled = true;
      disposeThemeEffect?.();
      markersLayer?.remove();
      map?.remove();
    };
  }, []);

  return <div ref={containerRef} class="map" />;
}
