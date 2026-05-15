import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { collectionsData, saveCollection, deleteCollection, saveState } from '../state/catalog.ts';
import { pointsData, loadPoints, pointsLoadState } from '../state/pointsState.ts';
import { githubLogin } from '../state/auth.ts';
import type { Collection } from '@shared/types/data.ts';
import { loadSavedOrder } from '../state/orderState.ts';
import { useOrderedList } from '../hooks/useOrderedList.ts';
import { Modal } from './Modal.tsx';
import { ReferencesModal } from './ReferencesModal.tsx';
import { SortBar } from './SortBar.tsx';
import { Field, Input, Select, Textarea, FormActions } from './AdminForm.tsx';

function now(): string {
  return new Date().toISOString();
}
function makeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

interface FormState {
  id: string;
  type: 'festival' | 'series';
  name: string;
  color: string;
  description: string;
  year_start: string;
  year_end: string;
  organizer_or_author: string;
}
interface FormErrors {
  id?: string;
  name?: string;
  color?: string;
}

function validate(f: FormState): FormErrors {
  const errs: FormErrors = {};
  if (!f.id.trim()) errs.id = 'Обязательное поле';
  else if (!/^[a-z0-9-]+$/.test(f.id)) errs.id = 'Только a-z, 0-9, дефис';
  if (!f.name.trim()) errs.name = 'Обязательное поле';
  if (!/^#[0-9a-fA-F]{6}$/.test(f.color)) errs.color = 'Формат: #rrggbb';
  return errs;
}

export function CollectionsEditor(): JSX.Element {
  const collections = collectionsData.value;
  const [editing, setEditing] = useState<FormState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const saving = saveState.value === 'saving';

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [refPoints, setRefPoints] = useState<{ id: string; label: string; tab: 'points' }[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const ids = collections.map((c) => c.id);
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
    tab: 'collections',
    ids,
    statusOf: () => 'active',
  });
  const hasSavedOrder = loadSavedOrder('collections') !== null;
  const colById = new Map(collections.map((c) => [c.id, c]));

  function openNew(): void {
    setEditing({
      id: '',
      type: 'series',
      name: '',
      color: '#4DB8FF',
      description: '',
      year_start: '',
      year_end: '',
      organizer_or_author: '',
    });
    setIsNew(true);
    setErrors({});
  }
  function openEdit(c: Collection): void {
    setEditing({
      id: c.id,
      type: c.type,
      name: c.name,
      color: c.color,
      description: c.description ?? '',
      year_start: c.year_start !== undefined && c.year_start !== null ? String(c.year_start) : '',
      year_end: c.year_end !== undefined && c.year_end !== null ? String(c.year_end) : '',
      organizer_or_author: c.organizer_or_author ?? '',
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
    const existing = collections.find((c) => c.id === editing.id);
    const col: Collection = {
      id: editing.id.trim(),
      type: editing.type,
      name: editing.name.trim(),
      color: editing.color,
      status: 'active',
      ...(editing.description.trim() ? { description: editing.description.trim() } : {}),
      ...(editing.year_start ? { year_start: Number(editing.year_start) } : {}),
      ...(editing.year_end ? { year_end: Number(editing.year_end) } : {}),
      ...(editing.organizer_or_author.trim()
        ? { organizer_or_author: editing.organizer_or_author.trim() }
        : {}),
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
      created_by: existing?.created_by ?? login,
      updated_by: login,
    };
    try {
      await saveCollection(col);
      close();
    } catch {
      /* saveState отображает */
    }
  }

  async function handleDeleteClick(id: string): Promise<void> {
    setLoadingDeleteId(id);
    if (pointsLoadState.value !== 'ready') await loadPoints();
    const refs = pointsData.value
      .filter((p) => p.collection_ids.includes(id))
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
      await deleteCollection(confirmId);
    } finally {
      setConfirmId(null);
    }
  }

  return (
    <div class="cat-editor">
      <div class="cat-editor__toolbar">
        <h2 class="cat-editor__heading">Коллекции</h2>
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
            <th>Тип</th>
            <th>Название</th>
            <th>Цвет</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orderedIds.map((id, index) => {
            const c = colById.get(id);
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
                <td>{c.type}</td>
                <td>{c.name}</td>
                <td>
                  <span class="admin-color-swatch" style={{ background: c.color }} />
                  <span class="admin-table__mono">{c.color}</span>
                </td>
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
          title="Невозможно удалить коллекцию"
          items={refPoints}
          onClose={() => {
            setDeletingId(null);
            setRefPoints([]);
          }}
        />
      )}
      {confirmId && (
        <Modal title="Удалить коллекцию?" onClose={() => setConfirmId(null)}>
          <p class="ref-modal__text">
            Коллекция «{colById.get(confirmId)?.name}» будет удалена без возможности восстановления.
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
        <Modal title={isNew ? 'Новая коллекция' : 'Редактировать коллекцию'} onClose={close}>
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
            <Field label="Тип">
              <Select
                value={editing.type}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    type: (e.target as HTMLSelectElement).value as 'festival' | 'series',
                  })
                }
              >
                <option value="series">series</option>
                <option value="festival">festival</option>
              </Select>
            </Field>
            <Field label="Цвет обводки маркера" required error={errors.color}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={editing.color}
                  onInput={(e) =>
                    setEditing({ ...editing, color: (e.target as HTMLInputElement).value })
                  }
                  style={{
                    width: '2.5rem',
                    height: '2rem',
                    padding: '0',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                  }}
                />
                <Input
                  value={editing.color}
                  onInput={(e) =>
                    setEditing({ ...editing, color: (e.target as HTMLInputElement).value })
                  }
                  error={!!errors.color}
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            </Field>
            <Field label="Описание">
              <Textarea
                value={editing.description}
                onInput={(e) =>
                  setEditing({ ...editing, description: (e.target as HTMLTextAreaElement).value })
                }
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Год начала">
                <Input
                  type="number"
                  value={editing.year_start}
                  onInput={(e) =>
                    setEditing({ ...editing, year_start: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
              <Field label="Год конца">
                <Input
                  type="number"
                  value={editing.year_end}
                  onInput={(e) =>
                    setEditing({ ...editing, year_end: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
            </div>
            <Field label="Организатор / автор">
              <Input
                value={editing.organizer_or_author}
                onInput={(e) =>
                  setEditing({
                    ...editing,
                    organizer_or_author: (e.target as HTMLInputElement).value,
                  })
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
