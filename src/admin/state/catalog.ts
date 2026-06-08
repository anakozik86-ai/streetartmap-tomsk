import { signal } from '@preact/signals';
import type { Category, Collection, Author } from '@shared/types/data.ts';
import { getFile, putFile, decodeFileJson } from '../github/contents.ts';
import { repoOwner, repoName } from './repoMeta.ts';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const categoriesData = signal<Category[]>([]);
export const collectionsData = signal<Collection[]>([]);
export const authorsData = signal<Author[]>([]);

export const loadState = signal<LoadState>('idle');
export const saveState = signal<'idle' | 'saving' | 'error'>('idle');
export const catalogError = signal<string | null>(null);

// Очереди записи по файлам — исключают параллельные PUT к одному файлу
const writeQueues: Record<string, Promise<void>> = {};
function enqueue(filename: string, fn: () => Promise<void>): Promise<void> {
  const prev = writeQueues[filename] ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeQueues[filename] = next;
  return next;
}

async function loadJson<T>(filename: string): Promise<T[]> {
  const file = await getFile(repoOwner.value, repoName.value, `data/${filename}`);
  return decodeFileJson<T[]>(file);
}

/**
 * Атомарный read-modify-write по файлу каталога. Мутация применяется к
 * свежепрочитанным с диска данным внутри очереди — параллельные правки не
 * затирают друг друга, а свежий SHA читается прямо перед PUT (исключает 409
 * от собственных записей). Возвращённый массив кладётся в сигнал после коммита.
 */
function mutateFile<T>(
  filename: string,
  mutate: (current: T[]) => T[],
  setter: (v: T[]) => void,
  commitMsg: string,
): Promise<void> {
  saveState.value = 'saving';
  return enqueue(filename, async () => {
    const owner = repoOwner.value;
    const repo = repoName.value;
    const path = `data/${filename}`;
    try {
      const fresh = await getFile(owner, repo, path);
      const next = mutate(decodeFileJson<T[]>(fresh));
      await putFile(owner, repo, path, next as unknown[], fresh.sha, commitMsg);
      setter(next);
      saveState.value = 'idle';
    } catch (e) {
      saveState.value = 'error';
      throw e;
    }
  });
}

export async function loadCatalog(): Promise<void> {
  if (loadState.value === 'loading' || loadState.value === 'ready') return;
  loadState.value = 'loading';
  catalogError.value = null;
  try {
    const [cats, cols, auths] = await Promise.all([
      loadJson<Category>('categories.json'),
      loadJson<Collection>('collections.json'),
      loadJson<Author>('authors.json'),
    ]);
    categoriesData.value = cats;
    collectionsData.value = cols;
    authorsData.value = auths;
    loadState.value = 'ready';
  } catch (e) {
    catalogError.value = e instanceof Error ? e.message : 'Ошибка загрузки';
    loadState.value = 'error';
  }
}

export function resetCatalog(): void {
  loadState.value = 'idle';
}

// ── Save ──────────────────────────────────────────────────────

export async function saveCategory(cat: Category): Promise<void> {
  await mutateFile<Category>(
    'categories.json',
    (current) => {
      const idx = current.findIndex((c) => c.id === cat.id);
      return idx >= 0 ? current.map((c) => (c.id === cat.id ? cat : c)) : [...current, cat];
    },
    (v) => {
      categoriesData.value = v;
    },
    `admin: upsert category ${cat.id}`,
  );
}

export async function saveCollection(col: Collection): Promise<void> {
  await mutateFile<Collection>(
    'collections.json',
    (current) => {
      const idx = current.findIndex((c) => c.id === col.id);
      return idx >= 0 ? current.map((c) => (c.id === col.id ? col : c)) : [...current, col];
    },
    (v) => {
      collectionsData.value = v;
    },
    `admin: upsert collection ${col.id}`,
  );
}

export async function saveAuthor(author: Author): Promise<void> {
  await mutateFile<Author>(
    'authors.json',
    (current) => {
      const idx = current.findIndex((a) => a.id === author.id);
      return idx >= 0
        ? current.map((a) => (a.id === author.id ? author : a))
        : [...current, author];
    },
    (v) => {
      authorsData.value = v;
    },
    `admin: upsert author ${author.id}`,
  );
}

// ── Delete ────────────────────────────────────────────────────

export async function deleteCategory(id: string): Promise<void> {
  await mutateFile<Category>(
    'categories.json',
    (current) => current.filter((c) => c.id !== id),
    (v) => {
      categoriesData.value = v;
    },
    `admin: delete category ${id}`,
  );
}

export async function deleteCollection(id: string): Promise<void> {
  await mutateFile<Collection>(
    'collections.json',
    (current) => current.filter((c) => c.id !== id),
    (v) => {
      collectionsData.value = v;
    },
    `admin: delete collection ${id}`,
  );
}

export async function deleteAuthor(id: string): Promise<void> {
  await mutateFile<Author>(
    'authors.json',
    (current) => current.filter((a) => a.id !== id),
    (v) => {
      authorsData.value = v;
    },
    `admin: delete author ${id}`,
  );
}
