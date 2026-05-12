import { signal } from '@preact/signals';
import type { Category, Collection, Author } from '@shared/types/data.ts';
import { getFile, putFile } from '../github/contents.ts';
import { repoOwner, repoName } from './repoMeta.ts';

// --- state ---

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const categoriesData = signal<Category[]>([]);
export const collectionsData = signal<Collection[]>([]);
export const authorsData = signal<Author[]>([]);

export const loadState = signal<LoadState>('idle');
export const saveState = signal<'idle' | 'saving' | 'error'>('idle');
export const catalogError = signal<string | null>(null);

// sha кэш — нужен для PUT
const shaCache: Record<string, string> = {};

// --- load ---

async function loadJson<T>(filename: string): Promise<T[]> {
  const file = await getFile(repoOwner.value, repoName.value, `data/${filename}`);
  shaCache[filename] = file.sha;
  const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
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

// --- save helpers ---

async function saveFile<T>(
  filename: string,
  setter: (v: T[]) => void,
  next: T[],
  commitMsg: string,
): Promise<void> {
  saveState.value = 'saving';
  try {
    await putFile(
      repoOwner.value,
      repoName.value,
      `data/${filename}`,
      next as unknown[],
      shaCache[filename] ?? '',
      commitMsg,
    );
    // обновляем sha после успешного PUT
    const fresh = await getFile(repoOwner.value, repoName.value, `data/${filename}`);
    shaCache[filename] = fresh.sha;
    setter(next);
    saveState.value = 'idle';
  } catch (e) {
    saveState.value = 'error';
    throw e;
  }
}

// --- CRUD: categories ---

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

export async function archiveCategory(id: string, login: string): Promise<void> {
  const now = new Date().toISOString();
  const next = categoriesData.value.map((c) =>
    c.id === id ? { ...c, status: 'archived' as const, updated_at: now, updated_by: login } : c,
  );
  await saveFile(
    'categories.json',
    (v: Category[]) => {
      categoriesData.value = v;
    },
    next,
    `admin: archive category ${id}`,
  );
}

// --- CRUD: collections ---

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

export async function archiveCollection(id: string, login: string): Promise<void> {
  const now = new Date().toISOString();
  const next = collectionsData.value.map((c) =>
    c.id === id ? { ...c, status: 'archived' as const, updated_at: now, updated_by: login } : c,
  );
  await saveFile(
    'collections.json',
    (v: Collection[]) => {
      collectionsData.value = v;
    },
    next,
    `admin: archive collection ${id}`,
  );
}

// --- CRUD: authors ---

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

export async function archiveAuthor(id: string, login: string): Promise<void> {
  const now = new Date().toISOString();
  const next = authorsData.value.map((a) =>
    a.id === id ? { ...a, status: 'archived' as const, updated_at: now, updated_by: login } : a,
  );
  await saveFile(
    'authors.json',
    (v: Author[]) => {
      authorsData.value = v;
    },
    next,
    `admin: archive author ${id}`,
  );
}
