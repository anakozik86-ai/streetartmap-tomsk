/**
 * Управление пользовательским порядком и режимом сортировки.
 * Хранится в localStorage, не пушится в GitHub.
 *
 * Ключи:
 *   streetartmap.order.{tab}    — string[] (id-шники в нужном порядке)
 *   streetartmap.sortmode.{tab} — SortMode
 */

export type SortMode = 'published-first' | 'archived-first' | 'custom';
export type TabKey = 'points' | 'routes' | 'categories' | 'collections' | 'authors';

const ORDER_PREFIX = 'streetartmap.order.';
const SORTMODE_PREFIX = 'streetartmap.sortmode.';

// ── localStorage helpers ──────────────────────────────────────

export function loadSavedOrder(tab: TabKey): string[] | null {
  try {
    const raw = localStorage.getItem(ORDER_PREFIX + tab);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

export function saveOrder(tab: TabKey, ids: string[]): void {
  try {
    localStorage.setItem(ORDER_PREFIX + tab, JSON.stringify(ids));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function clearOrder(tab: TabKey): void {
  localStorage.removeItem(ORDER_PREFIX + tab);
}

export function loadSavedSortMode(tab: TabKey): SortMode | null {
  try {
    const raw = localStorage.getItem(SORTMODE_PREFIX + tab);
    if (raw === 'published-first' || raw === 'archived-first' || raw === 'custom') return raw;
    return null;
  } catch {
    return null;
  }
}

export function saveSortMode(tab: TabKey, mode: SortMode): void {
  try {
    localStorage.setItem(SORTMODE_PREFIX + tab, mode);
  } catch {
    /* ignore */
  }
}

// ── Order helpers ─────────────────────────────────────────────

/**
 * Мёрджит сохранённый порядок с актуальными id:
 * - Удалённые id вычищаются из saved
 * - Новые id (которых нет в saved) добавляются в конец
 */
export function mergeOrder(savedIds: string[], actualIds: string[]): string[] {
  const actualSet = new Set(actualIds);
  const filtered = savedIds.filter((id) => actualSet.has(id));
  const known = new Set(filtered);
  const newIds = actualIds.filter((id) => !known.has(id));
  return [...filtered, ...newIds];
}

/** Перемещает элемент на одну позицию вверх. */
export function moveUp(ids: string[], index: number): string[] {
  if (index <= 0) return ids;
  const next = [...ids];
  const tmp = next[index - 1] as string;
  next[index - 1] = next[index] as string;
  next[index] = tmp;
  return next;
}

/** Перемещает элемент на одну позицию вниз. */
export function moveDown(ids: string[], index: number): string[] {
  if (index >= ids.length - 1) return ids;
  const next = [...ids];
  const tmp = next[index] as string;
  next[index] = next[index + 1] as string;
  next[index + 1] = tmp;
  return next;
}

/** Сортировка по статусу — published/archived first. */
export function sortByStatus(
  ids: string[],
  statusOf: (id: string) => string,
  mode: 'published-first' | 'archived-first',
): string[] {
  return [...ids].sort((a, b) => {
    const sa = statusOf(a);
    const sb = statusOf(b);
    if (sa === sb) return 0;
    if (mode === 'published-first') return sa === 'published' ? -1 : 1;
    return sa === 'archived' ? -1 : 1;
  });
}
