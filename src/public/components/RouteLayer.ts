import L from 'leaflet';
import type { Route, Point } from '@shared/types/index.ts';

export interface RouteLayerOptions {
  map: L.Map;
  route: Route;
  pointsById: Map<string, Point>;
}

/**
 * Создаёт и добавляет на карту LayerGroup с полилинией маршрута.
 *
 * Приоритет геометрии:
 *   1. route.geometry (кэшированный LineString из OSRM)
 *   2. Прямые линии между coords точек из pointsById
 *
 * Крайние точки route.geometry всегда подменяются реальными координатами
 * из pointsById, чтобы избежать расхождения при редактировании точек.
 *
 * Polyline: подложка (чёрная, opacity 0.15) + основная (route.color ?? --accent, #b8ff3d).
 * interactive: false — не перехватывает клики маркеров.
 */
export function createRouteLayer(opts: RouteLayerOptions): L.LayerGroup {
  const { map, route, pointsById } = opts;

  const latlngs = resolveLatLngs(route, pointsById);
  const group = L.layerGroup();

  if (latlngs.length < 2) {
    group.addTo(map);
    return group;
  }

  // Подложка для контрастности на любом тайле
  L.polyline(latlngs, {
    color: '#000000',
    weight: 5,
    opacity: 0.15,
    interactive: false,
    bubblingMouseEvents: false,
    className: 'route-line route-line--shadow',
  }).addTo(group);

  // Основная линия (акцент)
  L.polyline(latlngs, {
    color: route.color ?? '#b8ff3d',
    weight: 3,
    opacity: 0.9,
    interactive: false,
    bubblingMouseEvents: false,
    className: 'route-line route-line--main',
  }).addTo(group);

  group.addTo(map);
  return group;
}

function resolveLatLngs(route: Route, pointsById: Map<string, Point>): L.LatLngExpression[] {
  if (route.geometry) {
    const coords = route.geometry.coordinates as [number, number][];

    // GeoJSON — [lng, lat], Leaflet — [lat, lng]
    const latlngs: L.LatLngExpression[] = coords.map(([lng, lat]) => [lat, lng]);

    // Подменяем крайние точки реальными координатами из данных
    const firstPoint = pointsById.get(route.point_ids[0] ?? '');
    const lastPoint = pointsById.get(route.point_ids[route.point_ids.length - 1] ?? '');

    if (firstPoint && latlngs.length > 0) {
      latlngs[0] = [firstPoint.coords.lat, firstPoint.coords.lng];
    }
    if (lastPoint && latlngs.length > 1) {
      latlngs[latlngs.length - 1] = [lastPoint.coords.lat, lastPoint.coords.lng];
    }

    return latlngs;
  }

  // Fallback: прямые линии по coords точек
  return route.point_ids
    .map((id) => pointsById.get(id))
    .filter((p): p is Point => p !== undefined)
    .map((p): L.LatLngExpression => [p.coords.lat, p.coords.lng]);
}
