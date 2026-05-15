import { signal } from '@preact/signals';
import type { Point, ContentStatus } from '@shared/types/data.ts';
import { getFile, putFile } from '../github/contents.ts';
import { repoOwner, repoName } from './repoMeta.ts';
import { githubLogin } from './auth.ts';
import { routesData } from './routesState.ts';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const pointsData = signal<Point[]>([]);
export const pointsLoadState = signal<LoadState>('idle');
export const pointsSaveState = signal<'idle' | 'saving' | 'error'>('idle');
export const pointsError = signal<string | null>(null);

const shaCache: Record<string, string> = {};
const FILENAME = 'points.json';

// Очередь записи — исключает параллельные PUT к одному файлу
let writeQueue: Promise<void> = Promise.resolve();
function enqueue(fn: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

async function readFile(): Promise<void> {
  const file = await getFile(repoOwner.value, repoName.value, `data/${FILENAME}`);
  shaCache[FILENAME] = file.sha;
  const binary = atob(file.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  pointsData.value = JSON.parse(new TextDecoder().decode(bytes)) as Point[];
}

function writeFile(next: Point[], commitMsg: string): Promise<void> {
  return enqueue(async () => {
    const owner = repoOwner.value;
    const repo = repoName.value;
    const path = `data/${FILENAME}`;
    // Всегда читаем свежий SHA перед PUT
    const freshBefore = await getFile(owner, repo, path);
    shaCache[FILENAME] = freshBefore.sha;
    await putFile(owner, repo, path, next as unknown[], shaCache[FILENAME], commitMsg);
    const updated = await getFile(owner, repo, path);
    shaCache[FILENAME] = updated.sha;
  });
}

export async function loadPoints(): Promise<void> {
  if (pointsLoadState.value === 'loading' || pointsLoadState.value === 'ready') return;
  pointsLoadState.value = 'loading';
  pointsError.value = null;
  try {
    await readFile();
    pointsLoadState.value = 'ready';
  } catch (e) {
    pointsError.value = e instanceof Error ? e.message : 'Ошибка загрузки';
    pointsLoadState.value = 'error';
  }
}

export function resetPoints(): void {
  pointsLoadState.value = 'idle';
}

export async function savePoint(point: Point): Promise<void> {
  const login = githubLogin.value;
  const now = new Date().toISOString();
  const list = pointsData.value;
  const existing = list.find((p) => p.id === point.id);
  const saved: Point = {
    ...point,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    created_by: existing?.created_by ?? login,
    updated_by: login,
  };
  const next = existing ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved];

  pointsSaveState.value = 'saving';
  try {
    await writeFile(next, `admin: upsert point ${saved.id}`);
    pointsData.value = next;
    pointsSaveState.value = 'idle';
  } catch (e) {
    pointsSaveState.value = 'error';
    throw e;
  }
}

/** Legacy — оставлен для совместимости. */
export async function archivePoint(id: string): Promise<void> {
  const login = githubLogin.value;
  const now = new Date().toISOString();
  const next = pointsData.value.map((p) =>
    p.id === id
      ? { ...p, status: 'archived' as ContentStatus, updated_at: now, updated_by: login }
      : p,
  );
  pointsSaveState.value = 'saving';
  try {
    await writeFile(next, `admin: archive point ${id}`);
    pointsData.value = next;
    pointsSaveState.value = 'idle';
  } catch (e) {
    pointsSaveState.value = 'error';
    throw e;
  }
}

export async function togglePointStatus(id: string): Promise<void> {
  const login = githubLogin.value;
  const now = new Date().toISOString();
  const point = pointsData.value.find((p) => p.id === id);
  if (!point) return;

  const nextStatus: ContentStatus = point.status === 'published' ? 'archived' : 'published';
  const optimistic = pointsData.value.map((p) =>
    p.id === id ? { ...p, status: nextStatus, updated_at: now, updated_by: login } : p,
  );
  const prev = pointsData.value;
  pointsData.value = optimistic;

  try {
    await writeFile(
      optimistic,
      `admin: ${nextStatus === 'published' ? 'publish' : 'archive'} point ${id}`,
    );
  } catch (e) {
    pointsData.value = prev;
    throw e;
  }
}

/** Возвращает маршруты, которые ссылаются на точку. */
export function findPointReferences(id: string): { id: string; name: string }[] {
  return routesData.value
    .filter((r) => r.point_ids.includes(id))
    .map((r) => ({ id: r.id, name: r.name }));
}

export async function deletePoint(id: string): Promise<void> {
  const next = pointsData.value.filter((p) => p.id !== id);
  pointsSaveState.value = 'saving';
  try {
    await writeFile(next, `admin: delete point ${id}`);
    pointsData.value = next;
    pointsSaveState.value = 'idle';
  } catch (e) {
    pointsSaveState.value = 'error';
    throw e;
  }
}
