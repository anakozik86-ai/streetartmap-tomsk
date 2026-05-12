import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { collectionsData, saveCollection, archiveCollection, saveState } from '../state/catalog.ts';
import { pat } from '../state/auth.ts';
import type { Collection } from '@shared/types/data.ts';
import { Modal } from './Modal.tsx';
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
  status: 'active' | 'archived';
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
  const [archiving, setArchiving] = useState<string | null>(null);
  const saving = saveState.value === 'saving';

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
      status: 'active',
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
      year_start: c.year_start != null ? String(c.year_start) : '',
      year_end: c.year_end != null ? String(c.year_end) : '',
      organizer_or_author: c.organizer_or_author ?? '',
      status: c.status,
    });
    setIsNew(false);
    setErrors({});
  }

  function close(): void {
    setEditing(null);
  }

  function onNameBlur(): void {
    if (editing && isNew && !editing.id) {
      setEditing({ ...editing, id: makeSlug(editing.name) });
    }
  }

  async function submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!editing) return;
    const errs = validate(editing);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    const login = pat.value.split(':')[0] ?? 'admin';
    const timestamp = now();
    const existing = collections.find((c) => c.id === editing.id);

    const col: Collection = {
      id: editing.id.trim(),
      type: editing.type,
      name: editing.name.trim(),
      color: editing.color,
      status: editing.status,
      ...(editing.description.trim() ? { description: editing.description.trim() } : {}),
      ...(editing.year_start ? { year_start: Number(editing.year_start) } : {}),
      ...(editing.year_end ? { year_end: Number(editing.year_end) } : {}),
      ...(editing.organizer_or_author.trim() ? { organizer_or_author: editing.organizer_or_author.trim() } : {}),
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

  async function doArchive(id: string): Promise<void> {
    const login = pat.value.split(':')[0] ?? 'admin';
    setArchiving(id);
    try {
      await archiveCollection(id, login);
    } finally {
      setArchiving(null);
    }
  }

  const active = collections.filter((c) => c.status === 'active');
  const archived = collections.filter((c) => c.status === 'archived');

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

      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Тип</th>
            <th>Название</th>
            <th>Цвет</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {active.map((c) => (
            <tr key={c.id}>
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
                  onClick={() => doArchive(c.id)}
                  disabled={archiving === c.id || saving}
                  title="Архивировать"
                >
                  ⊘
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {archived.length > 0 && (
        <details class="cat-editor__archived">
          <summary>Архивные ({archived.length})</summary>
          <table class="admin-table admin-table--muted">
            <tbody>
              {archived.map((c) => (
                <tr key={c.id}>
                  <td class="admin-table__id">{c.id}</td>
                  <td>{c.type}</td>
                  <td>{c.name}</td>
                  <td>
                    <span class="admin-color-swatch" style={{ background: c.color }} />
                    <span class="admin-table__mono">{c.color}</span>
                  </td>
                  <td class="admin-table__actions">
                    <button
                      class="admin-btn-icon"
                      onClick={() => openEdit(c)}
                      title="Редактировать"
                    >
                      ✎
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
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
                    flexShrink: '0',
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
            <Field label="Статус">
              <Select
                value={editing.status}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    status: (e.target as HTMLSelectElement).value as 'active' | 'archived',
                  })
                }
              >
                <option value="active">active</option>
                <option value="archived">archived</option>
              </Select>
            </Field>
            <FormActions onCancel={close} saving={saving} isNew={isNew} />
          </form>
        </Modal>
      )}
    </div>
  );
}
