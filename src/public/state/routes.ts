import { signal, computed } from '@preact/signals';
import type { Route } from '@shared/types/index.ts';

export const activeRouteIds = signal<ReadonlySet<string>>(new Set());

export const hasActiveRoutes = computed(() => activeRouteIds.value.size > 0);

export function toggleRoute(id: string): void {
  const next = new Set(activeRouteIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  activeRouteIds.value = next;
}

/** Маршруты, в которых участвует точка (только published). */
export function routesForPoint(pointId: string, routes: Route[]): Route[] {
  return routes.filter((r) => r.status === 'published' && r.point_ids.includes(pointId));
}
