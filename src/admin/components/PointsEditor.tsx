import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  pointsData,
  pointsLoadState,
  pointsError,
  loadPoints,
  togglePointStatus,
  deletePoint,
  findPointReferences,
} from '../state/pointsState.ts';
import { loadRoutesAdmin, routesLoadState } from '../state/routesState.ts';
import { categoriesData } from '../state/catalog.ts';
import { navigate } from '../state/router.ts';
import { loadSavedOrder } from '../state/orderState.ts';
import { useOrderedList } from '../hooks/useOrderedList.ts';
import { Modal } from './Modal.tsx';
import { ReferencesModal } from './ReferencesModal.tsx';
import { SortBar } from './SortBar.tsx';
import './PointsEditor.css';

const STATE_LABELS: Record<string, string> = {
  intact: 'цел',
  damaged: 'повреждён',
  restored: 'восстановлен',
  painted_over: 'закрашен',
  removed: 'удалён',
  unknown: '?',
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function PointsEditor(): JSX.Element {
  const points = pointsData.value;
  const loadState = pointsLoadState.value;
  const error = pointsError.value;
  const categories = categoriesData.value;

  const pointById = new Map(points.map((p) => [p.id, p]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const ids = points.map((p) => p.id);

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
    tab: 'points',
    ids,
    statusOf: (id) => pointById.get(id)?.status ?? 'archived',
  });

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [toggleErrors, setToggleErrors] = useState<Set<string>>(new Set());

  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [refRoutes, setRefRoutes] = useState<{ id: string; label: string; tab: 'routes' }[]>([]);
  const [refsModalOpen, setRefsModalOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadPoints();
  }, []);

  async function handleToggle(id: string): Promise<void> {
    setSavingIds((prev) => new Set(prev).add(id));
    setToggleErrors((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    try {
      await togglePointStatus(id);
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

  async function handleDeleteClick(id: string): Promise<void> {
    setLoadingDeleteId(id);
    if (routesLoadState.value !== 'ready') await loadRoutesAdmin();
    const refs = findPointReferences(id).map((r) => ({
      id: r.id,
      label: r.name,
      tab: 'routes' as const,
    }));
    setLoadingDeleteId(null);
    if (refs.length > 0) {
      setRefRoutes(refs);
      setRefsModalOpen(true);
    } else setConfirmId(id);
  }

  async function confirmDelete(): Promise<void> {
    if (!confirmId) return;
    setDeletingId(confirmId);
    setConfirmId(null);
    try {
      await deletePoint(confirmId);
    } finally {
      setDeletingId(null);
    }
  }

  const hasSavedOrder = loadSavedOrder('points') !== null;

  return (
    <div class="points-editor">
      <div class="points-editor__toolbar">
        <h2 class="points-editor__heading">Точки</h2>
        <button class="admin-btn admin-btn--primary" onClick={() => navigate('points', 'new')}>
          + Добавить
        </button>
      </div>

      {error && <div class="points-editor__error">{error}</div>}
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
                <th>Категория</th>
                <th>Состояние</th>
                <th>Обновлено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orderedIds.map((id, index) => {
                const p = pointById.get(id);
                if (!p) return null;
                const isArchived = p.status === 'archived';
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
                    <td class="admin-table__id">{p.id}</td>
                    <td>
                      <button class="admin-link-btn" onClick={() => navigate('points', p.id)}>
                        {p.title}
                      </button>
                    </td>
                    <td>{catById.get(p.category_id)?.name ?? p.category_id}</td>
                    <td>
                      <span class={`admin-state-badge admin-state-badge--${p.state}`}>
                        {STATE_LABELS[p.state] ?? p.state}
                      </span>
                    </td>
                    <td class="admin-table__muted">{formatDate(p.updated_at)}</td>
                    <td class="admin-table__actions">
                      <button
                        class="admin-btn-icon"
                        title="Редактировать"
                        onClick={() => navigate('points', p.id)}
                      >
                        ✎
                      </button>
                      <button
                        class="admin-btn-icon admin-btn-icon--danger"
                        title="Удалить"
                        disabled={loadingDeleteId === id || isDeleting || isSaving}
                        onClick={() => handleDeleteClick(id)}
                      >
                        {loadingDeleteId === id || isDeleting ? '…' : '🗑'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {refsModalOpen && (
        <ReferencesModal
          title="Невозможно удалить точку"
          items={refRoutes}
          onClose={() => {
            setRefsModalOpen(false);
            setRefRoutes([]);
          }}
        />
      )}

      {confirmId && (
        <Modal title="Удалить точку?" onClose={() => setConfirmId(null)}>
          <p class="ref-modal__text">
            Точка «{pointById.get(confirmId)?.title}» будет удалена без возможности восстановления.
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
