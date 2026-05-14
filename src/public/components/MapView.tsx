import { useEffect, useRef } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import L from 'leaflet';
import { themeMode } from '../hooks/useTheme.ts';
import { loadConfig } from '@shared/utils/loadConfig.ts';
import { loadPoints, loadRoutes } from '@shared/utils/loadData.ts';
import type { Point, Route } from '@shared/types/index.ts';
import { createPointIcon, isLost } from '../markers/createMarker.ts';
import { selectedPoint } from '../state/selectedPoint.ts';
import { activeCategories, activeCollections, showLost } from '../state/filters.ts';
import { activeRouteIds } from '../state/routes.ts';
import { categories, collections } from '../state/catalogState.ts';
import { createRouteLayer } from './RouteLayer.ts';
import './SmoothWheelZoom.ts'; // регистрирует L.Map handler smoothWheelZoom

interface TileConfig {
  url: string;
  subdomains: string;
  maxZoom: number;
}

const TILE_LAYERS: Record<'light' | 'dark', TileConfig> = {
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

export const mapLoadError = signal<string | null>(null);

function createTileLayer(theme: 'light' | 'dark'): L.TileLayer {
  const cfg = TILE_LAYERS[theme];
  return L.tileLayer(cfg.url, {
    subdomains: cfg.subdomains,
    maxZoom: cfg.maxZoom,
    keepBuffer: 6,
    updateWhenIdle: false,
    updateWhenZooming: true,
  });
}

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
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>' +
      ', ' +
      '<a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

    // Tap-toggle для тач-устройств (hover не работает на мобайле)
    L.DomEvent.on(container, 'click', (e) => {
      L.DomEvent.stopPropagation(e);
      container.classList.toggle('is-open');
    });

    // Закрывать при клике снаружи
    document.addEventListener('click', () => {
      container.classList.remove('is-open');
    });

    L.DomEvent.disableScrollPropagation(container);
    return container;
  };
  return control;
}

interface FilterState {
  activeCategories: ReadonlySet<string>;
  activeCollections: ReadonlySet<string>;
  showLost: boolean;
  routePointIds: ReadonlySet<string>;
}

function matchesFilter(point: Point, filters: FilterState): boolean {
  if (point.status !== 'published') return false;

  if (filters.routePointIds.has(point.id)) {
    if (isLost(point) && !filters.showLost) return false;
    return true;
  }

  if (isLost(point) && !filters.showLost) return false;
  if (filters.activeCategories.size > 0 && !filters.activeCategories.has(point.category_id))
    return false;
  if (
    filters.activeCollections.size > 0 &&
    !point.collection_ids.some((id) => filters.activeCollections.has(id))
  )
    return false;
  return true;
}

function clearActiveMarker(markerById: Map<string, L.Marker>): void {
  for (const marker of markerById.values()) {
    marker.getElement()?.classList.remove('is-active');
  }
}

function renderMarkers(
  map: L.Map,
  points: Point[],
  filters: FilterState,
  opts: { maxVisibleColors: number },
): { layer: L.LayerGroup; markerById: Map<string, L.Marker> } {
  const categoryById = new Map(
    categories.value.filter((c) => c.status === 'active').map((c) => [c.id, c]),
  );
  const collectionById = new Map(collections.value.map((c) => [c.id, c]));

  const layer = L.layerGroup();
  const markerById = new Map<string, L.Marker>();

  for (const point of points) {
    if (!matchesFilter(point, filters)) continue;

    const icon = createPointIcon(point, {
      categoryById,
      collectionById,
      maxVisibleColors: opts.maxVisibleColors,
    });
    if (!icon) continue;

    const marker = L.marker([point.coords.lat, point.coords.lng], {
      icon,
      title: point.title,
      alt: point.title,
      riseOnHover: false,
      keyboard: true,
    });

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (selectedPoint.value?.id === point.id) {
        selectedPoint.value = null;
      } else {
        clearActiveMarker(markerById);
        selectedPoint.value = point;
        marker.getElement()?.classList.add('is-active');
      }
    });

    marker.addTo(layer);
    markerById.set(point.id, marker);
  }

  layer.addTo(map);
  return { layer, markerById };
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: L.Map | null = null;
    let tileLayer: L.TileLayer | null = null;
    let markersLayer: L.LayerGroup | null = null;
    let markerById = new Map<string, L.Marker>();
    const routeLayers = new Map<string, L.LayerGroup>();
    let allPoints: Point[] = [];
    let allRoutes: Route[] = [];
    let maxVisibleColors = 4;
    const disposeEffects: Array<() => void> = [];
    let cancelled = false;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectedPoint.value = null;
    };
    window.addEventListener('keydown', handleEsc);

    (async () => {
      try {
        const [config, points, routes] = await Promise.all([
          loadConfig(),
          loadPoints(),
          loadRoutes(),
        ]);
        if (cancelled) return;

        allPoints = points;
        allRoutes = routes;
        maxVisibleColors = config.features.max_visible_collection_colors;
        if (config.features.show_lost_works_default && !showLost.value) {
          showLost.value = true;
        }

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
          // maxBoundsViscosity: 1.0 убран — он вызывал «прыжок» карты обратно к центру
          // при зуме до уровня, когда viewport выходил за границы города.
          // Мягкая граница (0.5) позволяет немного выйти за bounds без резкого возврата.
          ...(bounds ? { maxBounds: bounds, maxBoundsViscosity: 1.0 } : {}),
          // minZoom: 12 — на меньшем уровне CartoDB начинает показывать английские названия
          minZoom: 13,
          zoomSnap: 0,
          zoomDelta: 0.5,
          // Отключаем стандартный wheel zoom — его заменяет smoothWheelZoom handler
          scrollWheelZoom: false,
          smoothWheelZoom: true,
          smoothSensitivity: 1,
        });

        createAttributionControl().addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        tileLayer = createTileLayer(themeMode.value);
        tileLayer.addTo(map);

        // Принудительный пересчёт размера после монтирования —
        // контейнер может ещё не иметь финальных размеров в момент L.map()
        requestAnimationFrame(() => map?.invalidateSize());

        map.on('click', () => {
          selectedPoint.value = null;
        });

        const rebuildMarkers = () => {
          if (!map) return;
          markersLayer?.remove();

          const routePointIds = new Set<string>();
          for (const routeId of activeRouteIds.value) {
            const route = allRoutes.find((r) => r.id === routeId && r.status === 'published');
            if (route) {
              for (const pid of route.point_ids) routePointIds.add(pid);
            }
          }

          const filters: FilterState = {
            activeCategories: activeCategories.value,
            activeCollections: activeCollections.value,
            showLost: showLost.value,
            routePointIds,
          };
          const result = renderMarkers(map, allPoints, filters, { maxVisibleColors });
          markersLayer = result.layer;
          markerById = result.markerById;

          const sp = selectedPoint.value;
          if (sp && !matchesFilter(sp, filters)) {
            selectedPoint.value = null;
          }
        };

        disposeEffects.push(
          effect(() => {
            void activeCategories.value;
            void activeCollections.value;
            void showLost.value;
            void activeRouteIds.value;
            rebuildMarkers();
          }),
        );

        disposeEffects.push(
          effect(() => {
            if (selectedPoint.value === null) {
              clearActiveMarker(markerById);
            }
          }),
        );

        disposeEffects.push(
          effect(() => {
            if (!map) return;
            const ids = activeRouteIds.value;

            for (const [id, layer] of routeLayers) {
              if (!ids.has(id)) {
                layer.remove();
                routeLayers.delete(id);
              }
            }

            const pointsById = new Map(allPoints.map((p) => [p.id, p]));
            for (const id of ids) {
              if (routeLayers.has(id)) continue;
              const route = allRoutes.find((r) => r.id === id && r.status === 'published');
              if (!route) continue;
              const layer = createRouteLayer({ map: map!, route, pointsById });
              routeLayers.set(id, layer);
            }
          }),
        );

        disposeEffects.push(
          effect(() => {
            const theme = themeMode.value;
            if (!map) return;
            if (tileLayer) map.removeLayer(tileLayer);
            tileLayer = createTileLayer(theme);
            tileLayer.addTo(map);
            // После смены тайлового слоя принудительно пересчитываем размер —
            // иначе карта может остаться обрезанной (Leaflet не видит изменений DOM)
            requestAnimationFrame(() => map?.invalidateSize());
          }),
        );
      } catch (e) {
        if (!cancelled) {
          mapLoadError.value = e instanceof Error ? e.message : 'Ошибка загрузки карты';
        }
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleEsc);
      disposeEffects.forEach((d) => d());
      for (const layer of routeLayers.values()) layer.remove();
      markersLayer?.remove();
      map?.remove();
    };
  }, []);

  return (
    <>
      <div ref={containerRef} class="map" />
      {mapLoadError.value && (
        <div class="map__error" role="alert">
          {mapLoadError.value}
        </div>
      )}
    </>
  );
}
