import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import L from 'leaflet';
import type { Route, Point, ContentStatus, RouteGeometry } from '@shared/types/data.ts';
import { loadConfig } from '@shared/utils/loadConfig.ts';
import { navigate } from '../state/router.ts';
import {
  routesData,
  routesLoadState,
  routesSaveState,
  loadRoutesAdmin,
  saveRoute,
} from '../state/routesState.ts';
import { pointsData, pointsLoadState, loadPoints } from '../state/pointsState.ts';
import { createPointIcon } from '../../public/markers/createMarker.ts';
import { categories, collections, loadCatalog } from '../../public/state/catalogState.ts';
import { themeMode } from '../../public/hooks/useTheme.ts';
import { createTileLayer, createAttributionControl } from '../../public/map/mapSetup.ts';
import { createDebouncedRouter, type DebouncedRouter } from './routing/debouncedRouter.ts';
import {
  makeAnchorWaypoint,
  extractAnchorIds,
  extractViaCoords,
  onlyAnchors,
} from './routing/waypointHelpers.ts';
import { computeGeometryHash } from './routing/geometryHash.ts';
import { effect } from '@preact/signals';
import './RouteForm.css';

// ── типы ──────────────────────────────────────────────────────────────────────

interface RouteDraft {
  id: string;
  status: ContentStatus;
  name: string;
  description: string;
  color: string;
  point_ids: string[];
  via_waypoints: [number, number][];
  geometry: RouteGeometry | null;
  total_distance_m: number | null;
  total_duration_s: number | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function emptyDraft(): RouteDraft {
  return {
    id: '',
    status: 'archived',
    name: '',
    description: '',
    color: '#b8ff3d',
    point_ids: [],
    via_waypoints: [],
    geometry: null,
    total_distance_m: null,
    total_duration_s: null,
  };
}

function routeToDraft(r: Route): RouteDraft {
  return {
    id: r.id,
    status: r.status,
    name: r.name,
    description: r.description ?? '',
    color: r.color ?? '#b8ff3d',
    point_ids: [...r.point_ids],
    via_waypoints: r.via_waypoints
      ? r.via_waypoints.map((p): [number, number] => [p[0], p[1]])
      : [],
    geometry: r.geometry
      ? {
          type: 'LineString',
          coordinates: r.geometry.coordinates.map((c): [number, number] => [c[0], c[1]]),
        }
      : null,
    total_distance_m: r.total_distance_m ?? null,
    total_duration_s: r.total_duration_s ?? null,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// ── компонент ─────────────────────────────────────────────────────────────────

export function RouteForm({ routeId }: { routeId: string }): JSX.Element {
  const isNew = routeId === 'new';
  const storageKey = `streetartmap_route_draft_${routeId}`;

  // --- local state ---
  const [draft, setDraft] = useState<RouteDraft>(emptyDraft);
  const [idTouched, setIdTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [lrmReady, setLrmReady] = useState(false);
  const [lineEditMode, setLineEditMode] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState<RouteDraft | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ref для синхронной записи в beforeunload (не re-render)
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // --- leaflet refs ---
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lrmRef = useRef<L.Routing.RoutingControl | null>(null);
  const routerRef = useRef<DebouncedRouter | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Реф на функцию пересоздания LRM с другим флагом addWaypoints.
  // Нужен потому что переключение режима вызывается из JSX-обработчика, а
  // setup LRM живёт внутри async useEffect — обычной closure не достать.
  // LRM не умеет менять addWaypoints/routeWhileDragging на лету.
  const recreateLrmRef = useRef<((addWaypoints: boolean) => void) | null>(null);

  // --- история изменений (undo/redo) ---
  // Хранит снимки { point_ids, via_waypoints }. Применение через setWaypoints
  // на LRM. Флаг `applying` нужен чтобы waypointschanged-event, который сам
  // эмитится при применении snapshot, не положил его обратно в историю.
  type HistorySnapshot = {
    point_ids: string[];
    via_waypoints: [number, number][];
  };
  const HISTORY_LIMIT = 30;
  const historyRef = useRef<{
    snapshots: HistorySnapshot[];
    index: number;
    applying: boolean;
  }>({ snapshots: [], index: -1, applying: false });
  // historyVersion — счётчик, чтобы триггерить re-render кнопок Undo/Redo
  // (disabled-состояние зависит от historyRef.index, а ref не реактивен).
  const [historyVersion, setHistoryVersion] = useState(0);

  // --- загрузка данных ---
  useEffect(() => {
    loadPoints();
    loadRoutesAdmin();
    loadCatalog();
  }, []);

  // --- гидратация draft ---
  // Ждём pointsLoadState === 'ready' (для новых маршрутов хватит).
  // Для существующих — дополнительно routesLoadState === 'ready'.
  useEffect(() => {
    if (draftHydrated) return;
    if (pointsLoadState.value !== 'ready') return;
    if (!isNew && routesLoadState.value !== 'ready') return;

    let initial: RouteDraft;

    if (isNew) {
      initial = emptyDraft();
    } else {
      const existing = routesData.value.find((r) => r.id === routeId);
      if (!existing) {
        // routes загружены, но такого маршрута нет — уходим назад
        navigate('routes', null);
        return;
      }
      initial = routeToDraft(existing);
    }

    // Проверка localStorage черновика
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as RouteDraft;
        if (JSON.stringify(parsed) !== JSON.stringify(initial)) {
          setShowRestorePrompt(parsed);
          setDraft(initial);
          setDraftHydrated(true);
          return;
        }
      }
    } catch {
      // битый JSON — игнорируем
    }

    setDraft(initial);
    setDraftHydrated(true);
  }, [
    draftHydrated,
    isNew,
    routeId,
    storageKey,
    pointsLoadState.value,
    routesLoadState.value,
    routesData.value,
  ]);

  // --- auto-slug id из name при создании ---
  useEffect(() => {
    if (!isNew || idTouched) return;
    const slug = slugify(draft.name);
    setDraft((d) => (slug === d.id ? d : { ...d, id: slug }));
  }, [draft.name, isNew, idTouched]);

  // --- debounced запись в localStorage (500ms) ---
  useEffect(() => {
    if (!draftHydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(draftRef.current));
      } catch {
        // QuotaExceededError — игнорируем
      }
    }, 500);
    return () => clearTimeout(t);
  }, [draft, draftHydrated, storageKey]);

  // --- sync write при закрытии вкладки ---
  useEffect(() => {
    const handler = (): void => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(draftRef.current));
      } catch {
        // noop
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [storageKey]);

  // --- инициализация Leaflet карты (один раз) ---
  // Используем тот же setup что в публичной MapView: те же тайлы (с переключением темы),
  // те же minZoom/maxBounds/zoomSnap из config.json, тот же SmoothWheelZoom handler,
  // attribution-pill и zoom control bottomright. Поверх — LRM-routing-control и layer
  // с маркерами точек.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const container = mapContainerRef.current;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let tileLayer: L.TileLayer | null = null;
    let themeEffectDispose: (() => void) | null = null;

    (async () => {
      try {
        const config = await loadConfig();
        if (cancelled) return;

        const bounds = config.city.bounds
          ? L.latLngBounds(
              [config.city.bounds.sw.lat, config.city.bounds.sw.lng],
              [config.city.bounds.ne.lat, config.city.bounds.ne.lng],
            )
          : undefined;

        const map = L.map(container, {
          center: [config.city.center.lat, config.city.center.lng],
          zoom: config.city.default_zoom,
          zoomControl: false,
          attributionControl: false,
          ...(bounds ? { maxBounds: bounds, maxBoundsViscosity: 1.0 } : {}),
          minZoom: 13,
          zoomSnap: 0,
          zoomDelta: 0.5,
          scrollWheelZoom: false,
          smoothWheelZoom: true,
          smoothSensitivity: 1,
        });

        createAttributionControl().addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        tileLayer = createTileLayer(themeMode.value);
        tileLayer.addTo(map);

        // Подписка на переключение темы (как в публичной карте).
        themeEffectDispose = effect(() => {
          const theme = themeMode.value;
          if (!mapRef.current) return;
          if (tileLayer) mapRef.current.removeLayer(tileLayer);
          tileLayer = createTileLayer(theme);
          tileLayer.addTo(mapRef.current);
          requestAnimationFrame(() => mapRef.current?.invalidateSize());
        });

        // Принудительный пересчёт размера после монтирования.
        requestAnimationFrame(() => map.invalidateSize());

        const markersLayer = L.layerGroup().addTo(map);

        const router = createDebouncedRouter();
        routerRef.current = router;

        // Локальный helper: создаёт LRM-control с указанным режимом
        // редактирования и навешивает обработчики waypointschanged/routesfound.
        // Используется и при первой инициализации, и при toggle режима.
        function attachLrm(addWaypoints: boolean): L.Routing.RoutingControl {
          const ctrl = L.Routing.control({
            waypoints: [],
            router,
            show: false,
            // true — на сегментах появляются drag-handles, drag по линии добавляет
            //   via-waypoint (можно скорректировать путь между anchor'ами).
            // false — линия инертна, drag/scroll по карте не задевают LRM.
            addWaypoints,
            routeWhileDragging: false,
            fitSelectedRoutes: false,
            lineOptions: {
              styles: [
                { color: '#000000', weight: 5, opacity: 0.15 },
                { color: '#b8ff3d', weight: 3, opacity: 1 },
              ],
            },
            createMarker: () => false,
          }).addTo(map);

          ctrl.on('waypointschanged', () => {
            const wps = ctrl.getWaypoints();
            const point_ids = extractAnchorIds(wps);
            const via_waypoints = extractViaCoords(wps);
            setDraft((d) => ({ ...d, point_ids, via_waypoints }));

            // Любое изменение waypoints (клик по маркеру, drag via, ↑↓, ×,
            // toggle режима, applySnapshot) эмитит waypointschanged. Применение
            // через undo/redo помечаем флагом applying — иначе snapshot
            // мгновенно вернётся обратно в историю и redo сломается.
            if (!historyRef.current.applying) {
              pushSnapshot({ point_ids, via_waypoints });
            }
          });

          ctrl.on('routesfound', (e: unknown) => {
            const ev = e as { routes: L.Routing.IRoute[] };
            const r = ev.routes[0];
            if (!r) return;
            const geometry: RouteGeometry = {
              type: 'LineString',
              // LRM coordinates: L.LatLng ([lat, lng]). GeoJSON хранит [lng, lat].
              coordinates: r.coordinates?.map((c): [number, number] => [c.lng, c.lat]) ?? [],
            };
            setDraft((d) => ({
              ...d,
              geometry,
              total_distance_m: Math.round(r.summary?.totalDistance ?? 0),
              total_duration_s: Math.round(r.summary?.totalTime ?? 0),
            }));
          });

          return ctrl;
        }

        const lrm = attachLrm(false); // стартуем в режиме «инертной линии»

        // Функция переключения режима — пересоздаёт LRM с новым флагом,
        // сохраняя текущие waypoints. Доступна через ref для JSX-кнопки.
        recreateLrmRef.current = (addWaypoints: boolean) => {
          if (!mapRef.current || !lrmRef.current) return;
          const wps = lrmRef.current.getWaypoints();
          lrmRef.current.off('waypointschanged');
          lrmRef.current.off('routesfound');
          mapRef.current.removeControl(lrmRef.current);

          const next = attachLrm(addWaypoints);
          lrmRef.current = next;
          // Восстанавливаем waypoints — новый control триггерит waypointschanged
          // → routesfound, draft синхронизируется автоматически.
          next.setWaypoints(wps);
        };

        mapRef.current = map;
        lrmRef.current = lrm;
        routerRef.current = router;
        markersLayerRef.current = markersLayer;

        // ResizeObserver — карта корректно перерисовывается при изменении размера контейнера
        // (в т.ч. когда mobile-stub скрывается и .route-form__map становится видимым).
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize();
        });
        resizeObserver.observe(container);

        // Сигнализируем что LRM готов — это нужно чтобы applyDraftToLrm-useEffect
        // мог отработать, если гидратация draft случилась РАНЬШЕ async-init карты.
        setLrmReady(true);
      } catch (e) {
        console.error('Failed to init map in RouteForm', e);
      }
    })();

    return () => {
      cancelled = true;
      themeEffectDispose?.();
      resizeObserver?.disconnect();
      routerRef.current?.dispose();
      lrmRef.current?.off('waypointschanged');
      lrmRef.current?.off('routesfound');
      if (mapRef.current && lrmRef.current) {
        mapRef.current.removeControl(lrmRef.current);
      }
      mapRef.current?.remove();
      mapRef.current = null;
      lrmRef.current = null;
      routerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // --- применение draft к LRM (вызывается явно, не через useEffect) ---
  // Карта остаётся отцентрированной по config.city.center (как на публичной).
  // Раньше тут был fitBounds на anchorWps, но он вызывал залипание зума при
  // инициализации в момент когда контейнер был 0×0 (mobile-stub / docked DevTools).
  function applyDraftToLrm(d: RouteDraft): void {
    if (!lrmRef.current) return;
    const pointsById = new Map(pointsData.value.map((p) => [p.id, p] as const));
    const anchorWps: L.Routing.Waypoint[] = [];

    for (const id of d.point_ids) {
      const p = pointsById.get(id);
      if (!p) continue;
      anchorWps.push(makeAnchorWaypoint(L.latLng(p.coords.lat, p.coords.lng), id));
    }

    if (anchorWps.length >= 2 && d.via_waypoints.length > 0) {
      // via вставляем после первого anchor — LRM перераспределит при route()
      const wpsWithVia: L.Routing.Waypoint[] = [anchorWps[0]!];
      for (const v of d.via_waypoints) {
        wpsWithVia.push({ latLng: L.latLng(v[0], v[1]) });
      }
      for (let i = 1; i < anchorWps.length; i++) {
        wpsWithVia.push(anchorWps[i]!);
      }
      lrmRef.current.setWaypoints(wpsWithVia);
    } else {
      lrmRef.current.setWaypoints(anchorWps);
    }
  }

  // --- история изменений: push/undo/redo/apply ---

  function snapshotsEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
    if (a.point_ids.length !== b.point_ids.length) return false;
    if (a.via_waypoints.length !== b.via_waypoints.length) return false;
    for (let i = 0; i < a.point_ids.length; i++) {
      if (a.point_ids[i] !== b.point_ids[i]) return false;
    }
    for (let i = 0; i < a.via_waypoints.length; i++) {
      const av = a.via_waypoints[i]!;
      const bv = b.via_waypoints[i]!;
      if (av[0] !== bv[0] || av[1] !== bv[1]) return false;
    }
    return true;
  }

  function pushSnapshot(s: HistorySnapshot): void {
    const h = historyRef.current;
    const last = h.snapshots[h.index];
    if (last && snapshotsEqual(last, s)) return; // дубль

    // Обрезаем «redo-future» при новом действии
    h.snapshots = h.snapshots.slice(0, h.index + 1);
    h.snapshots.push(s);
    if (h.snapshots.length > HISTORY_LIMIT) {
      h.snapshots.shift();
    }
    h.index = h.snapshots.length - 1;
    setHistoryVersion((v) => v + 1);
  }

  function applySnapshot(s: HistorySnapshot): void {
    if (!lrmRef.current) return;
    const pointsById = new Map(pointsData.value.map((p) => [p.id, p] as const));
    const anchorWps: L.Routing.Waypoint[] = [];
    for (const id of s.point_ids) {
      const p = pointsById.get(id);
      if (!p) continue;
      anchorWps.push(makeAnchorWaypoint(L.latLng(p.coords.lat, p.coords.lng), id));
    }

    let allWps: L.Routing.Waypoint[];
    if (anchorWps.length >= 2 && s.via_waypoints.length > 0) {
      allWps = [anchorWps[0]!];
      for (const v of s.via_waypoints) {
        allWps.push({ latLng: L.latLng(v[0], v[1]) });
      }
      for (let i = 1; i < anchorWps.length; i++) allWps.push(anchorWps[i]!);
    } else {
      allWps = anchorWps;
    }

    historyRef.current.applying = true;
    lrmRef.current.setWaypoints(allWps);
    // Reset флаг в следующем тике — waypointschanged эмитится синхронно при setWaypoints.
    setTimeout(() => {
      historyRef.current.applying = false;
    }, 0);
  }

  function handleUndo(): void {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index--;
    applySnapshot(h.snapshots[h.index]!);
    setHistoryVersion((v) => v + 1);
  }

  function handleRedo(): void {
    const h = historyRef.current;
    if (h.index >= h.snapshots.length - 1) return;
    h.index++;
    applySnapshot(h.snapshots[h.index]!);
    setHistoryVersion((v) => v + 1);
  }

  // Убирает все via-waypoints, оставляет только anchor'ы. OSRM перепрокладывает
  // маршрут с нуля. Snapshot ляжет в историю автоматически через waypointschanged.
  function handleClearLine(): void {
    if (!lrmRef.current) return;
    const anchors = onlyAnchors(lrmRef.current.getWaypoints());
    lrmRef.current.setWaypoints(anchors);
  }

  // Удаление локального черновика из localStorage. Перезагружаем страницу,
  // чтобы перечитать draft с GitHub без коллизий со старым state'ом и историей.
  function handleDeleteDraft(): void {
    if (
      !confirm(
        'Удалить локальный черновик этого маршрута? Все несохранённые правки будут потеряны и страница перезагрузится.',
      )
    ) {
      return;
    }
    localStorage.removeItem(storageKey);
    window.location.reload();
  }

  // historyVersion в условии гарантирует ре-evaluation после useState-обновления.
  // Реальное значение читаем из historyRef (ref не реактивен сам по себе).
  const canUndo = historyVersion >= 0 && historyRef.current.index > 0;
  const canRedo =
    historyVersion >= 0 && historyRef.current.index < historyRef.current.snapshots.length - 1;

  // --- инициализация LRM waypoints после гидратации (один раз) ---
  // Зависим и от draftHydrated, и от lrmReady — карта инициализируется
  // асинхронно (loadConfig), и гидратация draft может произойти раньше.
  const lrmInitialized = useRef(false);
  useEffect(() => {
    if (!draftHydrated || !lrmReady) return;
    if (!lrmRef.current) return;
    if (lrmInitialized.current) return;
    lrmInitialized.current = true;
    if (draft.point_ids.length === 0) return;
    applyDraftToLrm(draft);
  }, [draftHydrated, lrmReady]);

  // --- keyboard shortcuts: Ctrl+Z / Ctrl+Y для undo/redo ---
  // Игнорируем когда фокус в input/textarea (не перехватывать ввод текста).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- рендер маркеров точек на карте ---
  useEffect(() => {
    if (!markersLayerRef.current) return;
    // Ждём загрузки каталога
    if (categories.value.length === 0 || collections.value.length === 0) return;

    const layer = markersLayerRef.current;
    layer.clearLayers();

    const categoryById = new Map(categories.value.map((c) => [c.id, c] as const));
    const collectionById = new Map(collections.value.map((c) => [c.id, c] as const));
    const selectedIds = new Set(draft.point_ids);
    const ctx = { categoryById, collectionById, maxVisibleColors: 4 };

    for (const point of pointsData.value) {
      if (point.status !== 'published') continue;
      const icon = createPointIcon(point, ctx);
      if (!icon) continue;

      const isSelected = selectedIds.has(point.id);
      const marker = L.marker([point.coords.lat, point.coords.lng], { icon });

      // Подсвечиваем задействованные маркеры (после добавления в DOM)
      marker.on('add', () => {
        const el = marker.getElement();
        if (el && isSelected) el.classList.add('marker--in-route');
      });

      // Клик по незадействованному маркеру — добавляет в маршрут.
      // Клик по задействованному — no-op (удаление только через × в списке).
      marker.on('click', () => {
        if (isSelected) return;
        if (!lrmRef.current) return;
        const currentAnchors = onlyAnchors(lrmRef.current.getWaypoints());
        lrmRef.current.setWaypoints([
          ...currentAnchors,
          makeAnchorWaypoint(L.latLng(point.coords.lat, point.coords.lng), point.id),
        ]);
      });

      marker.addTo(layer);
    }
  }, [pointsData.value, categories.value, collections.value, draft.point_ids]);

  // --- управление anchors ---

  function removeAnchor(pointId: string): void {
    if (!lrmRef.current) return;
    const currentAnchors = onlyAnchors(lrmRef.current.getWaypoints()).filter(
      (wp) => wp.name !== `anchor:${pointId}`,
    );
    lrmRef.current.setWaypoints(currentAnchors);
  }

  function moveAnchor(idx: number, delta: -1 | 1): void {
    if (!lrmRef.current) return;
    const currentAnchors = onlyAnchors(lrmRef.current.getWaypoints());
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= currentAnchors.length) return;
    const next = [...currentAnchors];
    [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
    lrmRef.current.setWaypoints(next);
  }

  function addAnchorFromSearch(point: Point): void {
    if (!lrmRef.current) return;
    if (draft.point_ids.includes(point.id)) return;
    const currentAnchors = onlyAnchors(lrmRef.current.getWaypoints());
    lrmRef.current.setWaypoints([
      ...currentAnchors,
      makeAnchorWaypoint(L.latLng(point.coords.lat, point.coords.lng), point.id),
    ]);
    setSearchQuery('');
  }

  // --- restore черновика (явный вызов, не useEffect — правка S3) ---
  function restoreDraft(): void {
    if (!showRestorePrompt) return;
    const stored = showRestorePrompt;
    setDraft(stored);
    applyDraftToLrm(stored);
    setShowRestorePrompt(null);
  }

  function discardDraft(): void {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // noop
    }
    setShowRestorePrompt(null);
  }

  // --- save ---
  async function handleSave(): Promise<void> {
    if (isSaving) return;
    setValidationError(null);

    if (!draft.id.trim() || !draft.name.trim()) {
      setValidationError('Заполните id и название');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(draft.id)) {
      setValidationError('ID: только a-z, 0-9, дефис');
      return;
    }
    if (draft.point_ids.length < 2) {
      setValidationError('Минимум 2 точки в маршруте');
      return;
    }
    if (!lrmRef.current) return;

    setIsSaving(true);
    try {
      const wps = lrmRef.current.getWaypoints();
      const point_ids = extractAnchorIds(wps);
      const via_waypoints = extractViaCoords(wps);
      const pointsById = new Map(pointsData.value.map((p) => [p.id, p] as const));
      const geometry_hash = await computeGeometryHash(point_ids, via_waypoints, pointsById);

      const route: Route = {
        id: draft.id,
        status: draft.status,
        name: draft.name,
        ...(draft.description.trim() ? { description: draft.description } : {}),
        point_ids,
        ...(via_waypoints.length > 0 ? { via_waypoints } : {}),
        geometry: draft.geometry,
        geometry_hash,
        ...(draft.total_distance_m !== null ? { total_distance_m: draft.total_distance_m } : {}),
        ...(draft.total_duration_s !== null ? { total_duration_s: draft.total_duration_s } : {}),
        ...(draft.color && draft.color !== '#b8ff3d' ? { color: draft.color } : {}),
        // Auditable поля заполняются в saveRoute
        created_at: '',
        created_by: '',
        updated_at: '',
        updated_by: '',
      };

      await saveRoute(route);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // noop
      }
      navigate('routes', null);
    } catch (e) {
      console.error('Save route failed', e);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel(): void {
    if (confirm('Отменить изменения? Черновик сохранится в браузере.')) {
      navigate('routes', null);
    }
  }

  // --- поиск точек ---
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const selected = new Set(draft.point_ids);
    return pointsData.value
      .filter((p) => p.status === 'published')
      .filter((p) => !selected.has(p.id))
      .filter((p) => p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .slice(0, 10);
  }, [searchQuery, pointsData.value, draft.point_ids]);

  const pointsById = useMemo(
    () => new Map(pointsData.value.map((p) => [p.id, p] as const)),
    [pointsData.value],
  );

  // --- loading state (показываем пока данные не загружены) ---
  const isLoading =
    !draftHydrated &&
    (pointsLoadState.value !== 'ready' || (!isNew && routesLoadState.value !== 'ready'));

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div class="route-form">
      {/* Мобайл: вместо формы — заглушка (панель и карта скрыты через CSS) */}
      <div class="route-form__mobile-stub">
        Редактирование маршрутов доступно только на десктопе (≥600px).
      </div>

      {/* Диалог восстановления черновика */}
      {showRestorePrompt && (
        <div class="route-form__restore-overlay">
          <div class="route-form__restore-dialog">
            <h3>Восстановить черновик?</h3>
            <p>В браузере сохранён несохранённый черновик этого маршрута.</p>
            <div class="route-form__restore-actions">
              <button class="admin-btn" onClick={discardDraft}>
                Отклонить
              </button>
              <button class="admin-btn admin-btn--primary" onClick={restoreDraft}>
                Восстановить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Левая панель */}
      <aside class="route-form__panel">
        <div class="route-form__header">
          <button class="route-form__back" onClick={handleCancel}>
            ← Маршруты
          </button>
          <div class="route-form__header-actions">
            <button
              class="admin-btn route-form__delete-draft-btn"
              onClick={handleDeleteDraft}
              disabled={isSaving}
              title="Стереть локальный черновик и перезагрузить с сервера"
            >
              Удалить черновик
            </button>
            <button class="admin-btn" onClick={handleCancel} disabled={isSaving}>
              Отмена
            </button>
            <button
              class="admin-btn admin-btn--primary"
              onClick={() => void handleSave()}
              disabled={isSaving || draft.point_ids.length < 2 || !draft.name.trim()}
            >
              {isSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>

        {isLoading && (
          <p class="admin-loading" style={{ padding: '1rem' }}>
            Загрузка…
          </p>
        )}

        {!isLoading && (
          <>
            {/* Секция: Основное */}
            <section class="route-form__section">
              <h3 class="route-form__section-title">Основное</h3>
              <label class="route-form__field">
                <span>ID</span>
                <input
                  type="text"
                  value={draft.id}
                  disabled={!isNew}
                  onInput={(e) => {
                    setIdTouched(true);
                    setDraft((d) => ({ ...d, id: (e.currentTarget as HTMLInputElement).value }));
                  }}
                />
              </label>
              <label class="route-form__field">
                <span>Название</span>
                <input
                  type="text"
                  value={draft.name}
                  onInput={(e) =>
                    setDraft((d) => ({
                      ...d,
                      name: (e.currentTarget as HTMLInputElement).value,
                    }))
                  }
                />
              </label>
              <label class="route-form__field">
                <span>Описание</span>
                <textarea
                  rows={3}
                  value={draft.description}
                  onInput={(e) =>
                    setDraft((d) => ({
                      ...d,
                      description: (e.currentTarget as HTMLTextAreaElement).value,
                    }))
                  }
                />
              </label>
              <label class="route-form__field">
                <span>Цвет на карте</span>
                <div class="route-form__color-row">
                  <input
                    type="color"
                    value={draft.color}
                    onInput={(e) =>
                      setDraft((d) => ({
                        ...d,
                        color: (e.currentTarget as HTMLInputElement).value,
                      }))
                    }
                  />
                  <span class="route-form__color-hex">{draft.color}</span>
                </div>
                <small class="route-form__hint">
                  Применяется на публичной карте. В редакторе превью маршрута всегда отображается
                  фирменным зелёным.
                </small>
              </label>
              <label class="route-form__field">
                <span>Статус</span>
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      status: (e.currentTarget as HTMLSelectElement).value as ContentStatus,
                    }))
                  }
                >
                  <option value="published">Опубликовано</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
            </section>

            {/* Секция: Точки маршрута */}
            <section class="route-form__section">
              <h3 class="route-form__section-title">Точки маршрута</h3>
              <input
                class="route-form__search"
                type="text"
                placeholder="Найти точку…"
                value={searchQuery}
                onInput={(e) => setSearchQuery((e.currentTarget as HTMLInputElement).value)}
              />
              {searchResults.length > 0 && (
                <ul class="route-form__search-results">
                  {searchResults.map((p) => (
                    <li key={p.id}>
                      <button
                        class="route-form__search-item"
                        onClick={() => addAnchorFromSearch(p)}
                      >
                        <span class="route-form__search-title">{p.title}</span>
                        <code class="route-form__search-id">{p.id}</code>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {draft.point_ids.length === 0 ? (
                <div class="route-form__empty">
                  Добавьте точки через поиск или кликом по маркеру на карте.
                </div>
              ) : (
                <ol class="route-form__anchors">
                  {draft.point_ids.map((id, idx) => {
                    const p = pointsById.get(id);
                    return (
                      <li key={id} class="route-form__anchor">
                        <span class="route-form__anchor-num">{idx + 1}</span>
                        <span class="route-form__anchor-title">{p?.title ?? `[${id}]`}</span>
                        <div class="route-form__anchor-actions">
                          <button
                            disabled={idx === 0}
                            onClick={() => moveAnchor(idx, -1)}
                            aria-label="Вверх"
                          >
                            ↑
                          </button>
                          <button
                            disabled={idx === draft.point_ids.length - 1}
                            onClick={() => moveAnchor(idx, +1)}
                            aria-label="Вниз"
                          >
                            ↓
                          </button>
                          <button
                            class="route-form__anchor-remove"
                            onClick={() => removeAnchor(id)}
                            aria-label="Удалить из маршрута"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {/* Секция: Статистика */}
            <section class="route-form__section">
              <h3 class="route-form__section-title">Статистика</h3>
              <dl class="route-form__stats">
                <dt>Дистанция</dt>
                <dd>
                  {draft.total_distance_m !== null
                    ? `${(draft.total_distance_m / 1000).toFixed(2)} км`
                    : '—'}
                </dd>
                <dt>Время (пешком)</dt>
                <dd>
                  {draft.total_duration_s !== null
                    ? `${Math.round(draft.total_duration_s / 60)} мин`
                    : '—'}
                </dd>
                <dt>Drag-точек на линии</dt>
                <dd>{draft.via_waypoints.length}</dd>
              </dl>

              {validationError && <div class="route-form__save-error">{validationError}</div>}
              {routesSaveState.value === 'error' && !validationError && (
                <div class="route-form__save-error">Ошибка сохранения. Попробуйте ещё раз.</div>
              )}
            </section>
          </>
        )}
      </aside>

      {/* Правая часть: карта */}
      <div class="route-form__map-wrap">
        <div class="route-form__map-toolbar">
          <button
            type="button"
            class="route-form__tool-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            aria-label="Отменить"
          >
            ⟲
          </button>
          <button
            type="button"
            class="route-form__tool-btn"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Повторить (Ctrl+Y)"
            aria-label="Повторить"
          >
            ⟳
          </button>
          <button
            type="button"
            class="route-form__tool-btn"
            onClick={handleClearLine}
            disabled={draft.via_waypoints.length === 0}
            title="Убрать все промежуточные точки коррекции линии"
          >
            Сбросить линию
          </button>
          <button
            type="button"
            class={`route-form__tool-btn${lineEditMode ? ' is-on' : ''}`}
            onClick={() => {
              if (!recreateLrmRef.current) return;
              const next = !lineEditMode;
              recreateLrmRef.current(next);
              setLineEditMode(next);
            }}
            title={
              lineEditMode
                ? 'Выйти из режима редактирования линии'
                : 'Включить редактирование линии: drag по линии добавит промежуточную точку'
            }
          >
            {lineEditMode ? '✓ Редактирую линию' : '✎ Редактировать линию'}
          </button>
        </div>
        <div class="route-form__map" ref={mapContainerRef} />
      </div>
    </div>
  );
}
