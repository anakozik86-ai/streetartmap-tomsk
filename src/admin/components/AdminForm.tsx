import type { ComponentChildren, JSX } from 'preact';
import './AdminForm.css';

interface FieldProps {
  label: string;
  error?: string | undefined;
  required?: boolean | undefined;
  children: ComponentChildren;
}

export function Field({ label, error, required, children }: FieldProps): JSX.Element {
  return (
    <div class={`admin-field${error ? ' admin-field--error' : ''}`}>
      <label class="admin-field__label">
        {label}
        {required && <span class="admin-field__required">*</span>}
      </label>
      {children}
      {error && <span class="admin-field__error">{error}</span>}
    </div>
  );
}

interface InputProps extends JSX.HTMLAttributes<HTMLInputElement> { value?: string | undefined; type?: string | undefined;
  error?: boolean;
}
export function Input({ error, class: cls, ...rest }: InputProps): JSX.Element {
  return (
    <input
      class={`admin-input${error ? ' admin-input--error' : ''}${cls ? ` ${String(cls)}` : ''}`}
      {...rest}
    />
  );
}

interface SelectProps extends JSX.HTMLAttributes<HTMLSelectElement> { value?: string | undefined;
  error?: boolean;
}
export function Select({ error, class: cls, children, ...rest }: SelectProps): JSX.Element {
  return (
    <select
      class={`admin-select${error ? ' admin-select--error' : ''}${cls ? ` ${String(cls)}` : ''}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Textarea({
  class: cls,
  ...rest
}: JSX.HTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea class={`admin-textarea${cls ? ` ${String(cls)}` : ''}`} rows={4} {...rest} />;
}

interface FormActionsProps {
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}
export function FormActions({ onCancel, saving, isNew }: FormActionsProps): JSX.Element {
  return (
    <div class="admin-form-actions">
      <button type="button" class="admin-btn admin-btn--ghost" onClick={onCancel} disabled={saving}>
        Отмена
      </button>
      <button type="submit" class="admin-btn admin-btn--primary" disabled={saving}>
        {saving ? 'Сохранение…' : isNew ? 'Создать' : 'Сохранить'}
      </button>
    </div>
  );
}
