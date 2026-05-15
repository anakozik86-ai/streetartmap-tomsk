import type { JSX } from 'preact';
import type { SortMode } from '../state/orderState.ts';

interface Props {
  sortMode: SortMode;
  isDirty: boolean;
  savedOrder: boolean;
  onSortMode: (mode: SortMode) => void;
  onSaveOrder: () => void;
  onRevertOrder: () => void;
  onResetOrder: () => void;
}

export function SortBar({
  sortMode,
  isDirty,
  savedOrder,
  onSortMode,
  onSaveOrder,
  onRevertOrder,
  onResetOrder,
}: Props): JSX.Element {
  return (
    <div>
      <div class="admin-sort-bar">
        <span class="admin-sort-bar__label">Сортировка:</span>
        <div class="admin-sort-bar__buttons">
          <button
            class={`admin-sort-btn${sortMode === 'published-first' ? ' admin-sort-btn--active' : ''}`}
            onClick={() => onSortMode('published-first')}
          >
            Опубликованные вначале
          </button>
          <button
            class={`admin-sort-btn${sortMode === 'archived-first' ? ' admin-sort-btn--active' : ''}`}
            onClick={() => onSortMode('archived-first')}
          >
            Архивные вначале
          </button>
          <button
            class={`admin-sort-btn${sortMode === 'custom' ? ' admin-sort-btn--active' : ''}`}
            onClick={() => onSortMode('custom')}
          >
            Свой порядок
          </button>
        </div>
      </div>

      {sortMode === 'custom' && (
        <div class="admin-order-bar">
          {isDirty && <span class="admin-order-bar__dirty">Есть несохранённые изменения</span>}
          <button class="admin-btn admin-btn--ghost" onClick={onSaveOrder} disabled={!isDirty}>
            Сохранить порядок
          </button>
          <button
            class="admin-btn admin-btn--ghost"
            onClick={onRevertOrder}
            disabled={!isDirty || !savedOrder}
          >
            Откатить
          </button>
          <button class="admin-btn admin-btn--ghost" onClick={onResetOrder}>
            Сбросить
          </button>
        </div>
      )}
    </div>
  );
}
