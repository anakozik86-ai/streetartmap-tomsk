import L from 'leaflet';
import type { Category, Collection, Point } from '@shared/types/index.ts';
import { renderIconSvg, resolveIcon } from './icons.ts';

// ВРЕМЕННО (печать буклета): метки увеличены (было 36). Позже вернуть 36.
export const MARKER_SIZE = 48;

/**
 * Признак «утраченной» работы.
 * Решение о том, рендерить ли утраченную точку — на стороне вызывающего кода (MapView).
 * Здесь только определение факта.
 */
export function isLost(point: Point): boolean {
  return point.state === 'painted_over' || point.state === 'removed';
}

export interface MarkerBuildContext {
  categoryById: Map<string, Category>;
  collectionById: Map<string, Collection>;
  /** features.max_visible_collection_colors из config.json */
  maxVisibleColors: number;
}

/**
 * Построить Leaflet divIcon для точки.
 * Возвращает null только если категория не найдена или неактивна.
 * Утраченные точки рендерятся с классом marker--lost — видимость управляется в MapView.
 */
export function createPointIcon(point: Point, ctx: MarkerBuildContext): L.DivIcon | null {
  const category = ctx.categoryById.get(point.category_id);
  if (!category) return null;

  const lost = isLost(point);
  const ringStyle = ringBackground(point, ctx);
  const iconSvg = renderIconSvg(resolveIcon(category.icon), 'marker__icon');

  const html =
    `<div class="marker__ring"${ringStyle ? ` style="${ringStyle}"` : ''}>` +
    `<div class="marker__inner">${iconSvg}</div>` +
    `</div>` +
    (point.state === 'damaged' ? warnSvg() : '');

  const classes = ['marker'];
  if (point.state === 'damaged') classes.push('marker--damaged');
  if (lost) classes.push('marker--lost');

  return L.divIcon({
    html,
    className: classes.join(' '),
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
  });
}

/**
 * Сформировать строку `background: ...` для кольца:
 *  - 0 коллекций → не задаём, дефолт из CSS (нейтральный border-strong).
 *  - 1 коллекция → solid цвет.
 *  - 2..N коллекций (до maxVisibleColors) → conic-gradient равными секторами.
 *
 * Сортировка: year_start ASC (без year_start — в конец), затем по name.
 */
function ringBackground(point: Point, ctx: MarkerBuildContext): string {
  const colors = collectionColors(point, ctx);
  if (colors.length === 0) return '';
  if (colors.length === 1) return `background:${colors[0]!}`;

  const step = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${c} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`)
    .join(',');
  return `background:conic-gradient(${stops})`;
}

function collectionColors(point: Point, ctx: MarkerBuildContext): string[] {
  const resolved = point.collection_ids
    .map((id) => ctx.collectionById.get(id))
    .filter((c): c is Collection => c !== undefined && c.status === 'active');

  resolved.sort((a, b) => {
    const ay = a.year_start ?? Number.POSITIVE_INFINITY;
    const by = b.year_start ?? Number.POSITIVE_INFINITY;
    if (ay !== by) return ay - by;
    return a.name.localeCompare(b.name, 'ru');
  });

  return resolved.slice(0, ctx.maxVisibleColors).map((c) => c.color);
}

/**
 * Маленький треугольник-предупреждение в правом нижнем углу маркера.
 */
function warnSvg(): string {
  return (
    '<svg class="marker__warn" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" ' +
    'aria-hidden="true" focusable="false">' +
    '<path class="marker__warn-shape" d="M8 1.6 L14.6 13.4 H1.4 Z" stroke-linejoin="round" stroke-width="1.4"/>' +
    '</svg>'
  );
}
