import { signal } from '@preact/signals';
import type { Category, Collection, Author } from '@shared/types/data.ts';
import { getFile, putFile } from '../github/contents.ts';
import { repoOwner, repoName } from './repoMeta.ts';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const categoriesData = signal<Category[]>([]);
export const collectionsData = signal<Collection[]>([]);
export const authorsData = signal<Author[]>([]);

export const loadState = signal<LoadState>('idle');
export const saveState = signal<'idle' | 'saving' | 'error'>('idle');
export const catalogError = signal<string | null>(null);

const shaCache: Record<string, string> = {};

// Очереди записи по файлам — исключают параллельные PUT
const writeQueues: Record<string, Promise<void>> = {};
function enqueue(filename: string, fn: () => Promise<void>): Promise<void> {
  const prev = writeQueues[filename] ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeQueues[filename] = next;
  return next;
}

async function loadJson<T>(filename: string): Promise<T[]> {
  const file = await getFile(repoOwner.value, repoName.value, `data/${filename}`);
  shaCache[filename] = file.sha;
  const binary = atob(file.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const decoded = new TextDecoder().decode(bytes);
  return JSON.parse(decoded) as T[];
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

/**
 * PUT с автоматическим retry при 409 Conflict.
 * При 409 перечитываем SHA и повторяем один раз.
 */
function saveFile<T>(
  filename: string,
  setter: (v: T[]) => void,
  next: T[],
  commitMsg: string,
): Promise<void> {
  saveState.value = 'saving';
  return enqueue(filename, async () => {
    const owner = repoOwner.value;
    const repo = repoName.value;
    const path = `data/${filename}`;

    // Всегда читаем свежий SHA перед PUT
    const freshBefore = await getFile(owner, repo, path);
    shaCache[filename] = freshBefore.sha;

    try {
      await putFile(owner, repo, path, next as unknown[], shaCache[filename], commitMsg);
      // Обновляем SHA после успешного PUT
      const updated = await getFile(owner, repo, path);
      shaCache[filename] = updated.sha;
      setter(next);
      saveState.value = 'idle';
    } catch (e) {
      saveState.value = 'error';
      try {
        const fresh = await getFile(owner, repo, path);
        shaCache[filename] = fresh.sha;
      } catch {
        /* ignore */
      }
      throw e;
    }
  });
}

// ── Save ──────────────────────────────────────────────────────

export async function saveCategory(cat: Category): Promise<void> {
  const list = categoriesData.value;
  const idx = list.findIndex((c) => c.id === cat.id);
  const next = idx >= 0 ? list.map((c) => (c.id === cat.id ? cat : c)) : [...list, cat];
  await saveFile(
    'categories.json',
    (v: Category[]) => {
      categoriesData.value = v;
    },
    next,
    `admin: upsert category ${cat.id}`,
  );
}

export async function saveCollection(col: Collection): Promise<void> {
  const list = collectionsData.value;
  const idx = list.findIndex((c) => c.id === col.id);
  const next = idx >= 0 ? list.map((c) => (c.id === col.id ? col : c)) : [...list, col];
  await saveFile(
    'collections.json',
    (v: Collection[]) => {
      collectionsData.value = v;
    },
    next,
    `admin: upsert collection ${col.id}`,
  );
}

export async function saveAuthor(author: Author): Promise<void> {
  const list = authorsData.value;
  const idx = list.findIndex((a) => a.id === author.id);
  const next = idx >= 0 ? list.map((a) => (a.id === author.id ? author : a)) : [...list, author];
  await saveFile(
    'authors.json',
    (v: Author[]) => {
      authorsData.value = v;
    },
    next,
    `admin: upsert author ${author.id}`,
  );
}

// ── Delete ────────────────────────────────────────────────────

export async function deleteCategory(id: string): Promise<void> {
  const next = categoriesData.value.filter((c) => c.id !== id);
  await saveFile(
    'categories.json',
    (v: Category[]) => {
      categoriesData.value = v;
    },
    next,
    `admin: delete category ${id}`,
  );
}

export async function deleteCollection(id: string): Promise<void> {
  const next = collectionsData.value.filter((c) => c.id !== id);
  await saveFile(
    'collections.json',
    (v: Collection[]) => {
      collectionsData.value = v;
    },
    next,
    `admin: delete collection ${id}`,
  );
}

export async function deleteAuthor(id: string): Promise<void> {
  const next = authorsData.value.filter((a) => a.id !== id);
  await saveFile(
    'authors.json',
    (v: Author[]) => {
      authorsData.value = v;
    },
    next,
    `admin: delete author ${id}`,
  );
}
