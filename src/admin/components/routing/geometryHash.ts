import type { Point, RouteViaWaypoint } from '@shared/types/data.ts';

/**
 * Вычисляет geometry_hash для маршрута через Web Crypto API (browser).
 *
 * Формула ДОЛЖНА совпадать с scripts/validate-data.ts → geometryHashFor.
 * Изменение здесь требует синхронной правки там.
 *
 * Формат input строки:
 *   ANCHORS:{id1}:{lat6},{lng6}|{id2}:{lat6},{lng6}|VIA:{after}@{lat6},{lng6}|{after}@{lat6},{lng6}
 *
 * via_waypoints — RouteViaWaypoint с полем `after` (индекс anchor'а),
 * входят в hash чтобы любое смещение/перестановка/добавление via инвалидировали
 * geometry. Если точка из pointIds не найдена в pointsById — '?' вместо координат.
 */
export async function computeGeometryHash(
  pointIds: string[],
  viaWaypoints: RouteViaWaypoint[],
  pointsById: Map<string, Point>,
): Promise<string> {
  const anchorsStr = pointIds
    .map((id) => {
      const p = pointsById.get(id);
      return p ? `${id}:${p.coords.lat.toFixed(6)},${p.coords.lng.toFixed(6)}` : `${id}:?`;
    })
    .join('|');

  // Defensive: пропускаем невалидные элементы (например, старый формат [lat,lng]).
  // Симметрично scripts/validate-data.ts → geometryHashFor.
  const viaStr = viaWaypoints
    .filter(
      (v): v is RouteViaWaypoint =>
        v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        typeof (v as RouteViaWaypoint).after === 'number' &&
        typeof (v as RouteViaWaypoint).lat === 'number' &&
        typeof (v as RouteViaWaypoint).lng === 'number',
    )
    .map((v) => `${v.after}@${v.lat.toFixed(6)},${v.lng.toFixed(6)}`)
    .join('|');

  const payload = `ANCHORS:${anchorsStr}|VIA:${viaStr}`;

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
