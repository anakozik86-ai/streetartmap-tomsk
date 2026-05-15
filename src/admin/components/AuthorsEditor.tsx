import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { authorsData, saveAuthor, deleteAuthor, saveState } from '../state/catalog.ts';
import { pointsData, loadPoints, pointsLoadState } from '../state/pointsState.ts';
import { githubLogin } from '../state/auth.ts';
import type { Author } from '@shared/types/data.ts';
import { loadSavedOrder } from '../state/orderState.ts';
import { useOrderedList } from '../hooks/useOrderedList.ts';
import { Modal } from './Modal.tsx';
import { ReferencesModal } from './ReferencesModal.tsx';
import { SortBar } from './SortBar.tsx';
import { Field, Input, Textarea, FormActions } from './AdminForm.tsx';

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
  name: string;
  bio: string;
  origin: string;
  year_start: string;
  year_end: string;
}
interface FormErrors {
  id?: string;
  name?: string;
}

function validate(f: FormState): FormErrors {
  const errs: FormErrors = {};
  if (!f.id.trim()) errs.id = 'Обязательное поле';
  else if (!/^[a-z0-9-]+$/.test(f.id)) errs.id = 'Только a-z, 0-9, дефис';
  if (!f.name.trim()) errs.name = 'Обязательное поле';
  return errs;
}

function formatYears(a: Author): string {
  if (!a.active_years) return '—';
  return `${a.active_years.start ?? '?'}–${a.active_years.end ?? '…'}`;
}

export function AuthorsEditor(): JSX.Element {
  const authors = authorsData.value;
  const [editing, setEditing] = useState<FormState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const saving = saveState.value === 'saving';

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [refPoints, setRefPoints] = useState<{ id: string; label: string; tab: 'points' }[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const ids = authors.map((a) => a.id);
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
    tab: 'authors',
    ids,
    statusOf: () => 'active',
  });
  const hasSavedOrder = loadSavedOrder('authors') !== null;
  const authorById = new Map(authors.map((a) => [a.id, a]));

  function openNew(): void {
    setEditing({ id: '', name: '', bio: '', origin: '', year_start: '', year_end: '' });
    setIsNew(true);
    setErrors({});
  }
  function openEdit(a: Author): void {
    setEditing({
      id: a.id,
      name: a.name,
      bio: a.bio ?? '',
      origin: a.origin ?? '',
      year_start:
        a.active_years?.start !== undefined && a.active_years?.start !== null
          ? String(a.active_years.start)
          : '',
      year_end:
        a.active_years?.end !== undefined && a.active_years?.end !== null
          ? String(a.active_years.end)
          : '',
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
    const existing = authors.find((a) => a.id === editing.id);
    const hasYears = editing.year_start || editing.year_end;
    const author: Author = {
      id: editing.id.trim(),
      name: editing.name.trim(),
      status: 'active',
      ...(editing.bio.trim() ? { bio: editing.bio.trim() } : {}),
      ...(editing.origin.trim() ? { origin: editing.origin.trim() } : {}),
      ...(hasYears
        ? {
            active_years: {
              ...(editing.year_start ? { start: Number(editing.year_start) } : {}),
              ...(editing.year_end ? { end: Number(editing.year_end) } : {}),
            },
          }
        : {}),
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
      created_by: existing?.created_by ?? login,
      updated_by: login,
    };
    try {
      await saveAuthor(author);
      close();
    } catch {
      /* saveState отображает */
    }
  }

  async function handleDeleteClick(id: string): Promise<void> {
    setLoadingDeleteId(id);
    if (pointsLoadState.value !== 'ready') await loadPoints();
    const refs = pointsData.value
      .filter((p) => p.author_id === id)
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
      await deleteAuthor(confirmId);
    } finally {
      setConfirmId(null);
    }
  }

  return (
    <div class="cat-editor">
      <div class="cat-editor__toolbar">
        <h2 class="cat-editor__heading">Авторы</h2>
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
            <th>Имя</th>
            <th>Происхождение</th>
            <th>Годы</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orderedIds.map((id, index) => {
            const a = authorById.get(id);
            if (!a) return null;
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
                <td class="admin-table__id">{a.id}</td>
                <td>{a.name}</td>
                <td>{a.origin ?? '—'}</td>
                <td>{formatYears(a)}</td>
                <td class="admin-table__actions">
                  <button class="admin-btn-icon" onClick={() => openEdit(a)} title="Редактировать">
                    ✎
                  </button>
                  <button
                    class="admin-btn-icon admin-btn-icon--danger"
                    onClick={() => handleDeleteClick(a.id)}
                    disabled={loadingDeleteId === a.id || saving}
                    title="Удалить"
                  >
                    {loadingDeleteId === a.id ? '…' : '🗑'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {deletingId && refPoints.length > 0 && (
        <ReferencesModal
          title="Невозможно удалить автора"
          items={refPoints}
          onClose={() => {
            setDeletingId(null);
            setRefPoints([]);
          }}
        />
      )}
      {confirmId && (
        <Modal title="Удалить автора?" onClose={() => setConfirmId(null)}>
          <p class="ref-modal__text">
            Автор «{authorById.get(confirmId)?.name}» будет удалён без возможности восстановления.
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
        <Modal title={isNew ? 'Новый автор' : 'Редактировать автора'} onClose={close} wide>
          <form onSubmit={submit}>
            <Field label="Имя" required error={errors.name}>
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
            <Field label="Биография (markdown)">
              <Textarea
                value={editing.bio}
                rows={5}
                onInput={(e) =>
                  setEditing({ ...editing, bio: (e.target as HTMLTextAreaElement).value })
                }
              />
            </Field>
            <Field label="Происхождение (город, страна)">
              <Input
                value={editing.origin}
                onInput={(e) =>
                  setEditing({ ...editing, origin: (e.target as HTMLInputElement).value })
                }
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Активен с (год)">
                <Input
                  type="number"
                  value={editing.year_start}
                  onInput={(e) =>
                    setEditing({ ...editing, year_start: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
              <Field label="По (год)">
                <Input
                  type="number"
                  value={editing.year_end}
                  onInput={(e) =>
                    setEditing({ ...editing, year_end: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
            </div>
            <FormActions onCancel={close} saving={saving} isNew={isNew} />
          </form>
        </Modal>
      )}
    </div>
  );
}
