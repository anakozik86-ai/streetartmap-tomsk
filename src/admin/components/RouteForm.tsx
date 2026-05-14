import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import L from 'leaflet';
import type { Route, Point, ContentStatus, RouteGeometry } from '@shared/types/data.ts';
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
import { createDebouncedRouter, type DebouncedRouter } from './routing/debouncedRouter.ts';
import {
  makeAnchorWaypoint,
  extractAnchorIds,
  extractViaCoords,
  onlyAnchors,
} from './routing/waypointHelpers.ts';
import { computeGeometryHash } from './routing/geometryHash.ts';
import './RouteForm.css';

// ── типы ──────────────────────────────────────────────────────────────────────

interface RouteDraft {
  id: string;
  status: ContentStatus;
  name: string;
  description: string;
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
    status: 'draft',
    name: '',
    description: '',
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

const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARTO_ATTRIBUTION = '&copy; OSM &copy; CARTO';
const TOMSK_CENTER: [number, number] = [56.4847, 84.9482];

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
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: TOMSK_CENTER,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer(CARTO_LIGHT, {
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);

    const router = createDebouncedRouter();
    const lrm = L.Routing.control({
      waypoints: [],
      router,
      show: false,
      addWaypoints: true,
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

    // LRM = source of truth для waypoints → синхронизируем draft
    lrm.on('waypointschanged', () => {
      const wps = lrm.getWaypoints();
      const point_ids = extractAnchorIds(wps);
      const via_waypoints = extractViaCoords(wps);
      setDraft((d) => ({ ...d, point_ids, via_waypoints }));
    });

    // Обновляем geometry и статистику после построения маршрута
    lrm.on('routesfound', (e: unknown) => {
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

    mapRef.current = map;
    lrmRef.current = lrm;
    routerRef.current = router;
    markersLayerRef.current = markersLayer;

    // ResizeObserver — карта корректно перерисовывается при изменении размера контейнера
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      router.dispose();
      lrm.off('waypointschanged');
      lrm.off('routesfound');
      map.removeControl(lrm);
      map.remove();
      mapRef.current = null;
      lrmRef.current = null;
      routerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // --- применение draft к LRM (вызывается явно, не через useEffect) ---
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

    if (anchorWps.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(anchorWps.map((wp) => wp.latLng));
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  // --- инициализация LRM waypoints после гидратации (один раз) ---
  const lrmInitialized = useRef(false);
  useEffect(() => {
    if (!draftHydrated) return;
    if (!lrmRef.current) return;
    if (lrmInitialized.current) return;
    lrmInitialized.current = true;
    if (draft.point_ids.length === 0) return;
    applyDraftToLrm(draft);
  }, [draftHydrated]);

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
        Редактирование маршрутов доступно только на десктопе (≥768px).
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
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
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
      <div class="route-form__map" ref={mapContainerRef} />
    </div>
  );
}
