/**
 * Хук управления упорядоченным списком с localStorage.
 * Используется во всех 5 редакторах.
 */
import { useState, useEffect } from 'preact/hooks';
import {
  type SortMode,
  type TabKey,
  loadSavedOrder,
  loadSavedSortMode,
  saveOrder,
  saveSortMode,
  clearOrder,
  mergeOrder,
  moveUp,
  moveDown,
  sortByStatus,
} from '../state/orderState.ts';

interface UseOrderedListOptions {
  tab: TabKey;
  ids: string[];
  statusOf: (id: string) => string;
}

interface UseOrderedListResult {
  sortMode: SortMode;
  orderedIds: string[];
  isDirty: boolean;
  setSortMode: (mode: SortMode) => void;
  handleMoveUp: (index: number) => void;
  handleMoveDown: (index: number) => void;
  handleSaveOrder: () => void;
  handleRevertOrder: () => void;
  handleResetOrder: () => void;
}

export function useOrderedList({
  tab,
  ids,
  statusOf,
}: UseOrderedListOptions): UseOrderedListResult {
  const [sortMode, setSortModeState] = useState<SortMode>(
    () => loadSavedSortMode(tab) ?? 'published-first',
  );
  const [savedOrder, setSavedOrder] = useState<string[] | null>(() => loadSavedOrder(tab));
  const [initialized, setInitialized] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<string[]>([]);

  // Инициализируем когда ids непустые (данные загружены с GitHub)
  useEffect(() => {
    if (ids.length === 0 || initialized) return;
    const saved = loadSavedOrder(tab);
    const mode = loadSavedSortMode(tab) ?? 'published-first';
    if (saved && mode === 'custom') {
      setCurrentOrder(mergeOrder(saved, ids));
    } else if (mode !== 'custom') {
      setCurrentOrder(sortByStatus(ids, statusOf, mode));
    } else {
      setCurrentOrder([...ids]);
    }
    setInitialized(true);
  }, [ids.join(',')]);

  // Синхронизируем при добавлении/удалении записей после инициализации
  useEffect(() => {
    if (!initialized) return;
    setCurrentOrder((prev) => {
      const idsSet = new Set(ids);
      const filtered = prev.filter((id) => idsSet.has(id));
      const known = new Set(filtered);
      const added = ids.filter((id) => !known.has(id));
      return [...filtered, ...added];
    });
    setSavedOrder((prev) => (prev ? mergeOrder(prev, ids) : null));
  }, [ids.join(','), initialized]);

  function setSortMode(mode: SortMode): void {
    setSortModeState(mode);
    saveSortMode(tab, mode);
    if (mode === 'custom') {
      const order = savedOrder ? mergeOrder(savedOrder, ids) : [...ids];
      setCurrentOrder(order);
    } else {
      setCurrentOrder(sortByStatus(ids, statusOf, mode));
    }
  }

  function handleMoveUp(index: number): void {
    setCurrentOrder((prev) => moveUp(prev, index));
  }

  function handleMoveDown(index: number): void {
    setCurrentOrder((prev) => moveDown(prev, index));
  }

  function handleSaveOrder(): void {
    saveOrder(tab, currentOrder);
    setSavedOrder([...currentOrder]);
  }

  function handleRevertOrder(): void {
    if (!savedOrder) return;
    setCurrentOrder(mergeOrder(savedOrder, ids));
  }

  function handleResetOrder(): void {
    clearOrder(tab);
    setSavedOrder(null);
    setCurrentOrder(sortByStatus(ids, statusOf, 'published-first'));
    setSortModeState('published-first');
    saveSortMode(tab, 'published-first');
  }

  const isDirty =
    sortMode === 'custom' &&
    (savedOrder === null || JSON.stringify(currentOrder) !== JSON.stringify(savedOrder));

  const orderedIds = sortMode === 'custom' ? currentOrder : sortByStatus(ids, statusOf, sortMode);

  return {
    sortMode,
    orderedIds,
    isDirty,
    setSortMode,
    handleMoveUp,
    handleMoveDown,
    handleSaveOrder,
    handleRevertOrder,
    handleResetOrder,
  };
}
