import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Point, PointAccessibility, PointState, ContentStatus } from '@shared/types/data.ts';
import { navigate } from '../state/router.ts';
import { pointsData, pointsSaveState, loadPoints, savePoint } from '../state/pointsState.ts';
import { categoriesData, collectionsData, authorsData } from '../state/catalog.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Draft type — optional fields use string (empty string = not set)
interface PointDraft {
  id: string;
  status: ContentStatus;
  coords: { lat: number; lng: number };
  address_hint: string;
  accessibility: PointAccessibility;
  category_id: string;
  collection_ids: string[];
  tags: string[];
  title: string;
  description: string;
  author_id: string; // '' = not set
  year_created: number | null;
  dimensions: string;
  materials: string[];
  state: PointState;
  state_checked_at: string; // '' = not set
  photos: Point['photos'];
  featured: boolean;
}

function emptyDraft(): PointDraft {
  return {
    id: '',
    status: 'archived',
    coords: { lat: 56.4884, lng: 84.9481 },
    address_hint: '',
    accessibility: 'street',
    category_id: '',
    collection_ids: [],
    tags: [],
    title: '',
    description: '',
    author_id: '',
    year_created: null,
    dimensions: '',
    materials: [],
    state: 'unknown',
    state_checked_at: '',
    photos: [],
    featured: false,
  };
}

function pointToDraft(p: Point): PointDraft {
  return {
    id: p.id,
    status: p.status,
    coords: { ...p.coords },
    address_hint: p.address_hint ?? '',
    accessibility: p.accessibility,
    category_id: p.category_id,
    collection_ids: [...p.collection_ids],
    tags: [...p.tags],
    title: p.title,
    description: p.description,
    author_id: p.author_id ?? '',
    year_created: p.year_created ?? null,
    dimensions: p.dimensions ?? '',
    materials: [...p.materials],
    state: p.state,
    state_checked_at: p.state_checked_at ?? '',
    photos: p.photos,
    featured: p.featured,
  };
}

// ── TagInput ──────────────────────────────────────────────────────────────────

interface TagInputProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

function TagInput({ values, onChange, placeholder }: TagInputProps): JSX.Element {
  const [input, setInput] = useState('');

  function commit(): void {
    const trimmed = input.trim();
    if (!trimmed || values.includes(trimmed)) {
      setInput('');
      return;
    }
    onChange([...values, trimmed]);
    setInput('');
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function removeTag(tag: string): void {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <div class="tag-input">
      {values.map((tag) => (
        <span key={tag} class="tag-input__tag">
          {tag}
          <button
            type="button"
            class="tag-input__remove"
            onClick={() => removeTag(tag)}
            aria-label={`Удалить ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        class="tag-input__field"
        type="text"
        value={input}
        placeholder={values.length === 0 ? placeholder : ''}
        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
    </div>
  );
}

// ── CollectionChips ───────────────────────────────────────────────────────────

interface CollectionChipsProps {
  selected: string[];
  onChange: (next: string[]) => void;
}

function CollectionChips({ selected, onChange }: CollectionChipsProps): JSX.Element {
  const collections = collectionsData.value.filter((c) => c.status === 'active');

  function toggle(id: string): void {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  if (collections.length === 0) {
    return <p class="pf-empty">Нет активных коллекций</p>;
  }

  return (
    <div class="collection-chips">
      {collections.map((col) => (
        <button
          key={col.id}
          type="button"
          class={`collection-chip${selected.includes(col.id) ? ' collection-chip--active' : ''}`}
          onClick={() => toggle(col.id)}
        >
          <span class="collection-chip__dot" style={{ background: col.color }} />
          {col.name}
        </button>
      ))}
    </div>
  );
}

// ── PointForm ─────────────────────────────────────────────────────────────────

interface PointFormProps {
  pointId: string; // 'new' | existing id
}

export function PointForm({ pointId }: PointFormProps): JSX.Element {
  const isNew = pointId === 'new';

  useEffect(() => {
    loadPoints();
  }, []);

  const existing = isNew ? null : (pointsData.value.find((p) => p.id === pointId) ?? null);

  const [draft, setDraft] = useState<PointDraft>(() =>
    existing ? pointToDraft(existing) : emptyDraft(),
  );

  const [idTouched, setIdTouched] = useState(!isNew);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync draft after points load (handles direct URL navigation to #points/id)
  useEffect(() => {
    if (!isNew && draft.id === '') {
      const loaded = pointsData.value.find((p) => p.id === pointId);
      if (loaded) {
        setDraft(pointToDraft(loaded));
      }
    }
  }, [pointsData.value, isNew, pointId, draft.id]);

  // Auto-slug id from title when creating
  useEffect(() => {
    if (isNew && !idTouched) {
      setDraft((d) => ({ ...d, id: slugify(d.title) }));
    }
  }, [draft.title, isNew, idTouched]);

  function set<K extends keyof PointDraft>(key: K, value: PointDraft[K]): void {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave(): Promise<void> {
    setSaveError(null);
    if (!draft.id.trim()) {
      setSaveError('ID обязателен');
      return;
    }
    if (!draft.title.trim()) {
      setSaveError('Название обязательно');
      return;
    }
    if (!draft.category_id) {
      setSaveError('Категория обязательна');
      return;
    }

    const now = new Date().toISOString();

    // Build Point — only include optional fields if non-empty
    const base = existing ?? {
      created_at: now,
      created_by: '',
      updated_at: now,
      updated_by: '',
    };

    const point: Point = {
      ...base,
      id: draft.id.trim(),
      status: draft.status,
      coords: draft.coords,
      accessibility: draft.accessibility,
      category_id: draft.category_id,
      collection_ids: draft.collection_ids,
      tags: draft.tags,
      title: draft.title.trim(),
      description: draft.description,
      materials: draft.materials,
      state: draft.state,
      photos: draft.photos,
      featured: draft.featured,
      ...(draft.address_hint.trim() ? { address_hint: draft.address_hint.trim() } : {}),
      ...(draft.dimensions.trim() ? { dimensions: draft.dimensions.trim() } : {}),
      ...(draft.state_checked_at ? { state_checked_at: draft.state_checked_at } : {}),
      ...(draft.year_created !== null ? { year_created: draft.year_created } : {}),
      ...(draft.author_id ? { author_id: draft.author_id } : {}),
    };

    try {
      await savePoint(point);
      navigate('points');
    } catch {
      setSaveError('Ошибка сохранения');
    }
  }

  const categories = categoriesData.value.filter((c) => c.status === 'active');
  const authors = authorsData.value.filter((a) => a.status === 'active');
  const saving = pointsSaveState.value === 'saving';

  const accessibilityOptions: PointAccessibility[] = [
    'street',
    'courtyard',
    'interior',
    'restricted',
    'unknown',
  ];
  const accessibilityLabels: Record<PointAccessibility, string> = {
    street: 'Видно с улицы',
    courtyard: 'Во дворе',
    interior: 'Внутри здания',
    restricted: 'Закрытый объект',
    unknown: 'Доступность неизвестна',
  };

  const stateOptions: PointState[] = [
    'intact',
    'damaged',
    'restored',
    'painted_over',
    'removed',
    'unknown',
  ];
  const stateLabels: Record<PointState, string> = {
    intact: 'В порядке',
    damaged: 'Повреждена',
    restored: 'Восстановлена',
    painted_over: 'Закрашена',
    removed: 'Удалена',
    unknown: 'Состояние неизвестно',
  };

  const statusOptions: ContentStatus[] = ['published', 'archived'];
  const statusLabels: Record<ContentStatus, string> = {
    published: 'Опубликовано',
    archived: 'Архив',
  };

  return (
    <div class="point-form-overlay">
      <div class="point-form">
        {/* Header */}
        <div class="point-form__header">
          <button
            class="point-form__back"
            onClick={() => navigate('points')}
            aria-label="Назад к списку"
          >
            ← Точки
          </button>
          <h2 class="point-form__title">{isNew ? 'Новая точка' : draft.title || draft.id}</h2>
          <div class="point-form__header-actions">
            {saveError && <span class="point-form__error">{saveError}</span>}
            <button class="admin-btn" onClick={() => navigate('points')} disabled={saving}>
              Отмена
            </button>
            <button
              class="admin-btn admin-btn--primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div class="point-form__body">
          {/* Section: Основное */}
          <section class="pf-section">
            <h3 class="pf-section__title">Основное</h3>
            <div class="pf-grid">
              <div class="pf-field pf-field--wide">
                <label class="pf-label" for="pf-title">
                  Название <span class="pf-required">*</span>
                </label>
                <input
                  id="pf-title"
                  class="pf-input"
                  type="text"
                  value={draft.title}
                  onInput={(e) => set('title', (e.target as HTMLInputElement).value)}
                />
              </div>

              <div class="pf-field">
                <label class="pf-label" for="pf-id">
                  ID <span class="pf-required">*</span>
                </label>
                <input
                  id="pf-id"
                  class="pf-input pf-input--mono"
                  type="text"
                  value={draft.id}
                  disabled={!isNew}
                  onInput={(e) => {
                    setIdTouched(true);
                    set('id', (e.target as HTMLInputElement).value);
                  }}
                />
                {isNew && <p class="pf-hint">Генерируется из названия. Только [a-z0-9-].</p>}
              </div>

              <div class="pf-field">
                <label class="pf-label" for="pf-status">
                  Статус
                </label>
                <select
                  id="pf-status"
                  class="pf-select"
                  value={draft.status}
                  onChange={(e) =>
                    set('status', (e.target as HTMLSelectElement).value as ContentStatus)
                  }
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div class="pf-field pf-field--checkbox">
                <label class="pf-checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(e) => set('featured', (e.target as HTMLInputElement).checked)}
                  />
                  Избранное
                </label>
              </div>
            </div>
          </section>

          {/* Section: Расположение */}
          <section class="pf-section">
            <h3 class="pf-section__title">Расположение</h3>
            <div class="pf-grid">
              <div class="pf-field">
                <label class="pf-label" for="pf-lat">
                  Широта
                </label>
                <input
                  id="pf-lat"
                  class="pf-input pf-input--mono"
                  type="number"
                  step="0.000001"
                  value={draft.coords.lat}
                  onInput={(e) =>
                    set('coords', {
                      ...draft.coords,
                      lat: parseFloat((e.target as HTMLInputElement).value) || 0,
                    })
                  }
                />
              </div>

              <div class="pf-field">
                <label class="pf-label" for="pf-lng">
                  Долгота
                </label>
                <input
                  id="pf-lng"
                  class="pf-input pf-input--mono"
                  type="number"
                  step="0.000001"
                  value={draft.coords.lng}
                  onInput={(e) =>
                    set('coords', {
                      ...draft.coords,
                      lng: parseFloat((e.target as HTMLInputElement).value) || 0,
                    })
                  }
                />
              </div>

              <div class="pf-field pf-field--wide">
                <label class="pf-label" for="pf-address">
                  Адресная подсказка
                </label>
                <input
                  id="pf-address"
                  class="pf-input"
                  type="text"
                  value={draft.address_hint}
                  onInput={(e) => set('address_hint', (e.target as HTMLInputElement).value)}
                  placeholder="ул. Ленина, 10 (угол)"
                />
              </div>

              <div class="pf-field">
                <label class="pf-label" for="pf-accessibility">
                  Доступность
                </label>
                <select
                  id="pf-accessibility"
                  class="pf-select"
                  value={draft.accessibility}
                  onChange={(e) =>
                    set(
                      'accessibility',
                      (e.target as HTMLSelectElement).value as PointAccessibility,
                    )
                  }
                >
                  {accessibilityOptions.map((a) => (
                    <option key={a} value={a}>
                      {accessibilityLabels[a]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Section: Классификация */}
          <section class="pf-section">
            <h3 class="pf-section__title">Классификация</h3>
            <div class="pf-grid">
              <div class="pf-field">
                <label class="pf-label" for="pf-category">
                  Категория <span class="pf-required">*</span>
                </label>
                <select
                  id="pf-category"
                  class="pf-select"
                  value={draft.category_id}
                  onChange={(e) => set('category_id', (e.target as HTMLSelectElement).value)}
                >
                  <option value="">— выберите —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div class="pf-field pf-field--full">
                <label class="pf-label">Коллекции</label>
                <CollectionChips
                  selected={draft.collection_ids}
                  onChange={(next) => set('collection_ids', next)}
                />
              </div>

              <div class="pf-field pf-field--full">
                <label class="pf-label">Теги</label>
                <TagInput
                  values={draft.tags}
                  onChange={(next) => set('tags', next)}
                  placeholder="Введите тег, нажмите Enter"
                />
              </div>
            </div>
          </section>

          {/* Section: Описание */}
          <section class="pf-section">
            <h3 class="pf-section__title">Описание</h3>
            <div class="pf-grid">
              <div class="pf-field pf-field--full">
                <label class="pf-label" for="pf-description">
                  Описание (Markdown)
                </label>
                <textarea
                  id="pf-description"
                  class="pf-textarea"
                  value={draft.description}
                  onInput={(e) => set('description', (e.target as HTMLTextAreaElement).value)}
                  rows={5}
                />
              </div>

              <div class="pf-field">
                <label class="pf-label" for="pf-author">
                  Автор
                </label>
                <select
                  id="pf-author"
                  class="pf-select"
                  value={draft.author_id}
                  onChange={(e) => set('author_id', (e.target as HTMLSelectElement).value)}
                >
                  <option value="">— не указан —</option>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div class="pf-field">
                <label class="pf-label" for="pf-year">
                  Год создания
                </label>
                <input
                  id="pf-year"
                  class="pf-input pf-input--mono"
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  value={draft.year_created ?? ''}
                  onInput={(e) => {
                    const v = parseInt((e.target as HTMLInputElement).value);
                    set('year_created', isNaN(v) ? null : v);
                  }}
                  placeholder="2023"
                />
              </div>

              <div class="pf-field">
                <label class="pf-label" for="pf-dimensions">
                  Размеры
                </label>
                <input
                  id="pf-dimensions"
                  class="pf-input"
                  type="text"
                  value={draft.dimensions}
                  onInput={(e) => set('dimensions', (e.target as HTMLInputElement).value)}
                  placeholder="3×8 м"
                />
              </div>

              <div class="pf-field pf-field--full">
                <label class="pf-label">Материалы</label>
                <TagInput
                  values={draft.materials}
                  onChange={(next) => set('materials', next)}
                  placeholder="Аэрозоль, Масло…"
                />
              </div>
            </div>
          </section>

          {/* Section: Состояние */}
          <section class="pf-section">
            <h3 class="pf-section__title">Физическое состояние</h3>
            <div class="pf-grid">
              <div class="pf-field">
                <label class="pf-label" for="pf-state">
                  Состояние
                </label>
                <select
                  id="pf-state"
                  class="pf-select"
                  value={draft.state}
                  onChange={(e) =>
                    set('state', (e.target as HTMLSelectElement).value as PointState)
                  }
                >
                  {stateOptions.map((s) => (
                    <option key={s} value={s}>
                      {stateLabels[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div class="pf-field">
                <label class="pf-label" for="pf-checked-at">
                  Дата проверки
                </label>
                <input
                  id="pf-checked-at"
                  class="pf-input pf-input--mono"
                  type="date"
                  value={draft.state_checked_at ? draft.state_checked_at.slice(0, 10) : ''}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    set('state_checked_at', v ? `${v}T00:00:00.000Z` : '');
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
