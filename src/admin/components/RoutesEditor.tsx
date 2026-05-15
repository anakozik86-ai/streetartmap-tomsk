import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  routesData,
  routesLoadState,
  routesError,
  loadRoutesAdmin,
  toggleRouteStatus,
  deleteRoute,
} from '../state/routesState.ts';
import { navigate } from '../state/router.ts';
import { loadSavedOrder } from '../state/orderState.ts';
import { useOrderedList } from '../hooks/useOrderedList.ts';
import { Modal } from './Modal.tsx';
import { SortBar } from './SortBar.tsx';
import './RoutesEditor.css';

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function RoutesEditor(): JSX.Element {
  const routes = routesData.value;
  const loadState = routesLoadState.value;
  const error = routesError.value;

  const routeById = new Map(routes.map((r) => [r.id, r]));
  const ids = routes.map((r) => r.id);

  const {
    sortMode,
    orderedIds,
    isDirty,
    setSortMode,
    handleMoveUp,
    handleMoveDown,
    handleSaveOrder,
    handleRevertOrder,
    handleResetOrder,
  } = useOrderedList({
    tab: 'routes',
    ids,
    statusOf: (id) => routeById.get(id)?.status ?? 'archived',
  });

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [toggleErrors, setToggleErrors] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadRoutesAdmin();
  }, []);

  async function handleToggle(id: string): Promise<void> {
    setSavingIds((prev) => new Set(prev).add(id));
    setToggleErrors((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    try {
      await toggleRouteStatus(id);
    } catch {
      setToggleErrors((prev) => new Set(prev).add(id));
    } finally {
      setSavingIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!confirmId) return;
    setDeletingId(confirmId);
    setConfirmId(null);
    try {
      await deleteRoute(confirmId);
    } finally {
      setDeletingId(null);
    }
  }

  const hasSavedOrder = loadSavedOrder('routes') !== null;

  return (
    <div class="routes-editor">
      <div class="routes-editor__toolbar">
        <h2 class="routes-editor__heading">Маршруты</h2>
        <button class="admin-btn admin-btn--primary" onClick={() => navigate('routes', 'new')}>
          + Добавить
        </button>
      </div>

      {error && <div class="routes-editor__error">{error}</div>}
      {loadState === 'loading' && <div>Загрузка…</div>}

      {loadState === 'ready' && (
        <>
          <SortBar
            sortMode={sortMode}
            isDirty={isDirty}
            savedOrder={hasSavedOrder}
            onSortMode={setSortMode}
            onSaveOrder={handleSaveOrder}
            onRevertOrder={handleRevertOrder}
            onResetOrder={handleResetOrder}
          />

          <table class="admin-table">
            <thead>
              <tr>
                <th class="admin-table__toggle-cell"></th>
                {sortMode === 'custom' && <th class="admin-table__order-cell"></th>}
                <th>ID</th>
                <th>Название</th>
                <th>Точек</th>
                <th>Обновлён</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orderedIds.map((id, index) => {
                const r = routeById.get(id);
                if (!r) return null;
                const isArchived = r.status === 'archived';
                const isSaving = savingIds.has(id);
                const hasError = toggleErrors.has(id);
                const isDeleting = deletingId === id;
                const toggleClass = hasError
                  ? 'admin-status-toggle admin-status-toggle--error'
                  : isArchived
                    ? 'admin-status-toggle admin-status-toggle--archived'
                    : 'admin-status-toggle admin-status-toggle--published';

                return (
                  <tr key={id} class={isArchived ? 'admin-table__row--archived' : ''}>
                    <td class="admin-table__toggle-cell">
                      <button
                        class={toggleClass}
                        title={isArchived ? 'Опубликовать' : 'Архивировать'}
                        disabled={isSaving || isDeleting}
                        onClick={() => handleToggle(id)}
                      >
                        {isSaving ? '…' : isArchived ? '○' : '●'}
                      </button>
                    </td>
                    {sortMode === 'custom' && (
                      <td class="admin-table__order-cell">
                        <button
                          class="admin-order-btn"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          title="Вверх"
                        >
                          ↑
                        </button>
                        <button
                          class="admin-order-btn"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === orderedIds.length - 1}
                          title="Вниз"
                        >
                          ↓
                        </button>
                      </td>
                    )}
                    <td class="admin-table__id">{r.id}</td>
                    <td>
                      <button class="admin-link-btn" onClick={() => navigate('routes', r.id)}>
                        {r.name}
                      </button>
                    </td>
                    <td>{r.point_ids.length}</td>
                    <td class="admin-table__muted">{formatDate(r.updated_at)}</td>
                    <td class="admin-table__actions">
                      <button
                        class="admin-btn-icon"
                        title="Редактировать"
                        onClick={() => navigate('routes', r.id)}
                      >
                        ✎
                      </button>
                      <button
                        class="admin-btn-icon admin-btn-icon--danger"
                        title="Удалить"
                        disabled={isDeleting || isSaving}
                        onClick={() => setConfirmId(id)}
                      >
                        {isDeleting ? '…' : '🗑'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {confirmId && (
        <Modal title="Удалить маршрут?" onClose={() => setConfirmId(null)}>
          <p class="ref-modal__text">
            Маршрут «{routeById.get(confirmId)?.name}» будет удалён без возможности восстановления.
          </p>
          <div style={{ gap: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button class="admin-btn admin-btn--ghost" onClick={() => setConfirmId(null)}>
              Отмена
            </button>
            <button class="admin-btn admin-btn--danger" onClick={confirmDelete}>
              Удалить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
