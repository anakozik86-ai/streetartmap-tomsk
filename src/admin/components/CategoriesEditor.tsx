import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { categoriesData, saveCategory, deleteCategory, saveState } from '../state/catalog.ts';
import { pointsData, loadPoints, pointsLoadState } from '../state/pointsState.ts';
import { githubLogin } from '../state/auth.ts';
import type { Category } from '@shared/types/data.ts';
import { loadSavedOrder } from '../state/orderState.ts';
import { useOrderedList } from '../hooks/useOrderedList.ts';
import { Modal } from './Modal.tsx';
import { ReferencesModal } from './ReferencesModal.tsx';
import { SortBar } from './SortBar.tsx';
import { Field, Input, Select, FormActions } from './AdminForm.tsx';

const ICONS = [
  'image',
  'spray-can',
  'scissors',
  'layers',
  'tag',
  'box',
  'grid-2x2',
  'circle-help',
] as const;

function makeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
function now(): string {
  return new Date().toISOString();
}

interface FormState {
  id: string;
  name: string;
  icon: string;
  description: string;
  order: string;
}
interface FormErrors {
  id?: string;
  name?: string;
  order?: string;
}

function validate(f: FormState): FormErrors {
  const errs: FormErrors = {};
  if (!f.id.trim()) errs.id = 'Обязательное поле';
  else if (!/^[a-z0-9-]+$/.test(f.id)) errs.id = 'Только a-z, 0-9, дефис';
  if (!f.name.trim()) errs.name = 'Обязательное поле';
  if (isNaN(Number(f.order))) errs.order = 'Число';
  return errs;
}

export function CategoriesEditor(): JSX.Element {
  const categories = categoriesData.value;
  const [editing, setEditing] = useState<FormState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const saving = saveState.value === 'saving';

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [refPoints, setRefPoints] = useState<{ id: string; label: string; tab: 'points' }[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const ids = categories.map((c) => c.id);
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
    tab: 'categories',
    ids,
    statusOf: () => 'active',
  });
  const hasSavedOrder = loadSavedOrder('categories') !== null;
  const catById = new Map(categories.map((c) => [c.id, c]));

  function openNew(): void {
    setEditing({
      id: '',
      name: '',
      icon: 'image',
      description: '',
      order: String(categories.length),
    });
    setIsNew(true);
    setErrors({});
  }
  function openEdit(c: Category): void {
    setEditing({
      id: c.id,
      name: c.name,
      icon: c.icon,
      description: c.description ?? '',
      order: String(c.order),
    });
    setIsNew(false);
    setErrors({});
  }
  function close(): void {
    setEditing(null);
  }
  function onNameBlur(): void {
    if (editing && isNew && !editing.id) setEditing({ ...editing, id: makeSlug(editing.name) });
  }

  async function submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!editing) return;
    const errs = validate(editing);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    const login = githubLogin.value || 'admin';
    const timestamp = now();
    const existing = categories.find((c) => c.id === editing.id);
    const cat: Category = {
      id: editing.id.trim(),
      name: editing.name.trim(),
      icon: editing.icon,
      ...(editing.description.trim() ? { description: editing.description.trim() } : {}),
      order: Number(editing.order),
      status: 'active',
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
      created_by: existing?.created_by ?? login,
      updated_by: login,
    };
    try {
      await saveCategory(cat);
      close();
    } catch {
      /* saveState отображает */
    }
  }

  async function handleDeleteClick(id: string): Promise<void> {
    setLoadingDeleteId(id);
    if (pointsLoadState.value !== 'ready') await loadPoints();
    const refs = pointsData.value
      .filter((p) => p.category_id === id)
      .map((p) => ({ id: p.id, label: p.title, tab: 'points' as const }));
    setLoadingDeleteId(null);
    if (refs.length > 0) {
      setRefPoints(refs);
      setDeletingId(id);
    } else setConfirmId(id);
  }

  async function confirmDelete(): Promise<void> {
    if (!confirmId) return;
    try {
      await deleteCategory(confirmId);
    } finally {
      setConfirmId(null);
    }
  }

  return (
    <div class="cat-editor">
      <div class="cat-editor__toolbar">
        <h2 class="cat-editor__heading">Категории</h2>
        <button class="admin-btn admin-btn--primary" onClick={openNew}>
          + Добавить
        </button>
      </div>

      {saveState.value === 'error' && (
        <div class="cat-editor__save-error">
          Ошибка сохранения. Проверь PAT и права репозитория.
        </div>
      )}

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
            {sortMode === 'custom' && <th class="admin-table__order-cell"></th>}
            <th>ID</th>
            <th>Название</th>
            <th>Иконка</th>
            <th>Порядок</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orderedIds.map((id, index) => {
            const c = catById.get(id);
            if (!c) return null;
            return (
              <tr key={id}>
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
                <td class="admin-table__id">{c.id}</td>
                <td>{c.name}</td>
                <td class="admin-table__mono">{c.icon}</td>
                <td>{c.order}</td>
                <td class="admin-table__actions">
                  <button class="admin-btn-icon" onClick={() => openEdit(c)} title="Редактировать">
                    ✎
                  </button>
                  <button
                    class="admin-btn-icon admin-btn-icon--danger"
                    onClick={() => handleDeleteClick(c.id)}
                    disabled={loadingDeleteId === c.id || saving}
                    title="Удалить"
                  >
                    {loadingDeleteId === c.id ? '…' : '🗑'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {deletingId && refPoints.length > 0 && (
        <ReferencesModal
          title="Невозможно удалить категорию"
          items={refPoints}
          onClose={() => {
            setDeletingId(null);
            setRefPoints([]);
          }}
        />
      )}
      {confirmId && (
        <Modal title="Удалить категорию?" onClose={() => setConfirmId(null)}>
          <p class="ref-modal__text">
            Категория «{catById.get(confirmId)?.name}» будет удалена без возможности восстановления.
          </p>
          <div style={{ gap: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button class="admin-btn admin-btn--ghost" onClick={() => setConfirmId(null)}>
              Отмена
            </button>
            <button class="admin-btn admin-btn--danger" onClick={confirmDelete} disabled={saving}>
              {saving ? 'Удаление…' : 'Удалить'}
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title={isNew ? 'Новая категория' : 'Редактировать категорию'} onClose={close}>
          <form onSubmit={submit}>
            <Field label="Название" required error={errors.name}>
              <Input
                value={editing.name}
                onInput={(e) =>
                  setEditing({ ...editing, name: (e.target as HTMLInputElement).value })
                }
                onBlur={onNameBlur}
                error={!!errors.name}
                autoFocus
              />
            </Field>
            <Field label="ID (slug)" required error={errors.id}>
              <Input
                value={editing.id}
                onInput={(e) =>
                  setEditing({ ...editing, id: (e.target as HTMLInputElement).value })
                }
                error={!!errors.id}
                disabled={!isNew}
              />
            </Field>
            <Field label="Иконка (lucide)">
              <Select
                value={editing.icon}
                onChange={(e) =>
                  setEditing({ ...editing, icon: (e.target as HTMLSelectElement).value })
                }
              >
                {ICONS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Порядок" error={errors.order}>
              <Input
                type="number"
                value={editing.order}
                onInput={(e) =>
                  setEditing({ ...editing, order: (e.target as HTMLInputElement).value })
                }
                error={!!errors.order}
              />
            </Field>
            <Field label="Описание">
              <Input
                value={editing.description}
                onInput={(e) =>
                  setEditing({ ...editing, description: (e.target as HTMLInputElement).value })
                }
              />
            </Field>
            <FormActions onCancel={close} saving={saving} isNew={isNew} />
          </form>
        </Modal>
      )}
    </div>
  );
}
