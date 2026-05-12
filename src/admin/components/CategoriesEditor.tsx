import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { categoriesData, saveCategory, archiveCategory, saveState } from '../state/catalog.ts';
import { pat } from '../state/auth.ts';
import type { Category } from '@shared/types/data.ts';
import { Modal } from './Modal.tsx';
import { Field, Input, Select, FormActions } from './AdminForm.tsx';

// Список актуальных иконок lucide для категорий.
// При добавлении новой категории расширить этот массив.
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
  status: 'active' | 'archived';
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
  const [archiving, setArchiving] = useState<string | null>(null);
  const saving = saveState.value === 'saving';

  function openNew(): void {
    setEditing({
      id: '',
      name: '',
      icon: 'image',
      description: '',
      order: String(categories.length),
      status: 'active',
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
    const existing = categories.find((c) => c.id === editing.id);

    const cat: Category = {
      id: editing.id.trim(),
      name: editing.name.trim(),
      icon: editing.icon,
      ...(editing.description.trim() ? { description: editing.description.trim() } : {}),
      order: Number(editing.order),
      status: editing.status,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
      created_by: existing?.created_by ?? login,
      updated_by: login,
    };

    try {
      await saveCategory(cat);
      close();
    } catch {
      /* saveState.value = 'error' отображается в UI */
    }
  }

  async function doArchive(id: string): Promise<void> {
    const login = pat.value.split(':')[0] ?? 'admin';
    setArchiving(id);
    try {
      await archiveCategory(id, login);
    } finally {
      setArchiving(null);
    }
  }

  const active = categories.filter((c) => c.status === 'active');
  const archived = categories.filter((c) => c.status === 'archived');

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

      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Название</th>
            <th>Иконка</th>
            <th>Порядок</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {active.map((c) => (
            <tr key={c.id}>
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
                  <td>{c.name}</td>
                  <td class="admin-table__mono">{c.icon}</td>
                  <td>{c.order}</td>
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
