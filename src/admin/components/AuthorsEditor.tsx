import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { authorsData, saveAuthor, archiveAuthor, saveState } from '../state/catalog.ts';
import { pat } from '../state/auth.ts';
import type { Author } from '@shared/types/data.ts';
import { Modal } from './Modal.tsx';
import { Field, Input, Select, Textarea, FormActions } from './AdminForm.tsx';

function now(): string { return new Date().toISOString(); }
function makeSlug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

interface FormState {
  id: string;
  name: string;
  bio: string;
  origin: string;
  year_start: string;
  year_end: string;
  status: 'active' | 'archived';
}

interface FormErrors { id?: string; name?: string; }

function validate(f: FormState): FormErrors {
  const errs: FormErrors = {};
  if (!f.id.trim()) errs.id = 'Обязательное поле';
  else if (!/^[a-z0-9-]+$/.test(f.id)) errs.id = 'Только a-z, 0-9, дефис';
  if (!f.name.trim()) errs.name = 'Обязательное поле';
  return errs;
}

function formatYears(a: Author): string {
  if (!a.active_years) return '—';
  const s = a.active_years.start ?? '?';
  const e = a.active_years.end   ?? '…';
  return `${s}–${e}`;
}

export function AuthorsEditor(): JSX.Element {
  const authors = authorsData.value;
  const [editing, setEditing]     = useState<FormState | null>(null);
  const [isNew, setIsNew]         = useState(false);
  const [errors, setErrors]       = useState<FormErrors>({});
  const [archiving, setArchiving] = useState<string | null>(null);
  const saving = saveState.value === 'saving';

  function openNew(): void {
    setEditing({ id: '', name: '', bio: '', origin: '', year_start: '', year_end: '', status: 'active' });
    setIsNew(true);
    setErrors({});
  }

  function openEdit(a: Author): void {
    setEditing({
      id: a.id, name: a.name, bio: a.bio ?? '', origin: a.origin ?? '',
      year_start: a.active_years?.start != null ? String(a.active_years.start) : '',
      year_end:   a.active_years?.end   != null ? String(a.active_years.end)   : '',
      status: a.status,
    });
    setIsNew(false);
    setErrors({});
  }

  function close(): void { setEditing(null); }

  function onNameBlur(): void {
    if (editing && isNew && !editing.id) {
      setEditing({ ...editing, id: makeSlug(editing.name) });
    }
  }

  async function submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!editing) return;
    const errs = validate(editing);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const login     = pat.value.split(':')[0] ?? 'admin';
    const timestamp = now();
    const existing  = authors.find((a) => a.id === editing.id);

    const hasYears = editing.year_start || editing.year_end;
    const author: Author = {
      id:          editing.id.trim(),
      name:        editing.name.trim(),
      status:      editing.status,
      bio:         editing.bio.trim()    || undefined,
      origin:      editing.origin.trim() || undefined,
      active_years: hasYears
        ? { start: editing.year_start ? Number(editing.year_start) : undefined,
            end:   editing.year_end   ? Number(editing.year_end)   : undefined }
        : undefined,
      created_at:  existing?.created_at ?? timestamp,
      updated_at:  timestamp,
      created_by:  existing?.created_by ?? login,
      updated_by:  login,
    };

    try { await saveAuthor(author); close(); } catch { /* saveState отображает */ }
  }

  async function doArchive(id: string): Promise<void> {
    const login = pat.value.split(':')[0] ?? 'admin';
    setArchiving(id);
    try { await archiveAuthor(id, login); } finally { setArchiving(null); }
  }

  const active   = authors.filter((a) => a.status === 'active');
  const archived = authors.filter((a) => a.status === 'archived');

  return (
    <div class="cat-editor">
      <div class="cat-editor__toolbar">
        <h2 class="cat-editor__heading">Авторы</h2>
        <button class="admin-btn admin-btn--primary" onClick={openNew}>+ Добавить</button>
      </div>

      {saveState.value === 'error' && (
        <div class="cat-editor__save-error">Ошибка сохранения. Проверь PAT и права репозитория.</div>
      )}

      <table class="admin-table">
        <thead>
          <tr><th>ID</th><th>Имя</th><th>Происхождение</th><th>Годы</th><th></th></tr>
        </thead>
        <tbody>
          {active.map((a) => (
            <tr key={a.id}>
              <td class="admin-table__id">{a.id}</td>
              <td>{a.name}</td>
              <td>{a.origin ?? '—'}</td>
              <td>{formatYears(a)}</td>
              <td class="admin-table__actions">
                <button class="admin-btn-icon" onClick={() => openEdit(a)} title="Редактировать">✎</button>
                <button
                  class="admin-btn-icon admin-btn-icon--danger"
                  onClick={() => doArchive(a.id)}
                  disabled={archiving === a.id || saving}
                  title="Архивировать"
                >⊘</button>
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
              {archived.map((a) => (
                <tr key={a.id}>
                  <td class="admin-table__id">{a.id}</td>
                  <td>{a.name}</td>
                  <td>{a.origin ?? '—'}</td>
                  <td>{formatYears(a)}</td>
                  <td class="admin-table__actions">
                    <button class="admin-btn-icon" onClick={() => openEdit(a)} title="Редактировать">✎</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {editing && (
        <Modal title={isNew ? 'Новый автор' : 'Редактировать автора'} onClose={close} wide>
          <form onSubmit={submit}>
            <Field label="Имя" required error={errors.name}>
              <Input
                value={editing.name}
                onInput={(e) => setEditing({ ...editing, name: (e.target as HTMLInputElement).value })}
                onBlur={onNameBlur}
                error={!!errors.name}
                autoFocus
              />
            </Field>
            <Field label="ID (slug)" required error={errors.id}>
              <Input
                value={editing.id}
                onInput={(e) => setEditing({ ...editing, id: (e.target as HTMLInputElement).value })}
                error={!!errors.id}
                disabled={!isNew}
              />
            </Field>
            <Field label="Биография (markdown)">
              <Textarea
                value={editing.bio}
                rows={5}
                onInput={(e) => setEditing({ ...editing, bio: (e.target as HTMLTextAreaElement).value })}
              />
            </Field>
            <Field label="Происхождение (город, страна)">
              <Input
                value={editing.origin}
                onInput={(e) => setEditing({ ...editing, origin: (e.target as HTMLInputElement).value })}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Активен с (год)">
                <Input
                  type="number"
                  value={editing.year_start}
                  onInput={(e) => setEditing({ ...editing, year_start: (e.target as HTMLInputElement).value })}
                />
              </Field>
              <Field label="По (год)">
                <Input
                  type="number"
                  value={editing.year_end}
                  onInput={(e) => setEditing({ ...editing, year_end: (e.target as HTMLInputElement).value })}
                />
              </Field>
            </div>
            <Field label="Статус">
              <Select
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: (e.target as HTMLSelectElement).value as 'active' | 'archived' })}
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
