import { signal } from '@preact/signals';
import type { Point, ContentStatus } from '@shared/types/data.ts';
import { getFile, putFile, decodeFileJson } from '../github/contents.ts';
import { repoOwner, repoName } from './repoMeta.ts';
import { githubLogin } from './auth.ts';
import { routesData } from './routesState.ts';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const pointsData = signal<Point[]>([]);
export const pointsLoadState = signal<LoadState>('idle');
export const pointsSaveState = signal<'idle' | 'saving' | 'error'>('idle');
export const pointsError = signal<string | null>(null);

const FILENAME = 'points.json';
const PATH = `data/${FILENAME}`;

// Очередь записи — исключает параллельные PUT к одному файлу
let writeQueue: Promise<void> = Promise.resolve();
function enqueue(fn: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

async function readFile(): Promise<void> {
  const file = await getFile(repoOwner.value, repoName.value, PATH);
  pointsData.value = decodeFileJson<Point[]>(file);
}

/**
 * Атомарный read-modify-write. Мутация применяется к СВЕЖЕпрочитанным с диска
 * данным ВНУТРИ очереди, поэтому конкурентные операции (save + toggle, delete и
 * т.п.) не затирают друг друга на диске. Возвращает записанный массив, чтобы
 * вызывающий код согласовал локальный сигнал с тем, что реально закоммичено.
 */
function mutateFile(mutate: (current: Point[]) => Point[], commitMsg: string): Promise<Point[]> {
  let result: Point[] = [];
  const done = enqueue(async () => {
    const owner = repoOwner.value;
    const repo = repoName.value;
    const fresh = await getFile(owner, repo, PATH);
    result = mutate(decodeFileJson<Point[]>(fresh));
    await putFile(owner, repo, PATH, result, fresh.sha, commitMsg);
  });
  return done.then(() => result);
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
  pointsSaveState.value = 'saving';
  try {
    const next = await mutateFile((current) => {
      const existing = current.find((p) => p.id === point.id);
      const saved: Point = {
        ...point,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        created_by: existing?.created_by ?? login,
        updated_by: login,
      };
      return existing ? current.map((p) => (p.id === saved.id ? saved : p)) : [...current, saved];
    }, `admin: upsert point ${point.id}`);
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
  const prev = pointsData.value;
  // Оптимистично — мгновенный отклик UI. Реальная запись пересчитает статус из
  // свежих данных внутри очереди, а затем согласует сигнал с диском.
  pointsData.value = pointsData.value.map((p) =>
    p.id === id ? { ...p, status: nextStatus, updated_at: now, updated_by: login } : p,
  );

  try {
    const next = await mutateFile(
      (current) =>
        current.map((p) =>
          p.id === id
            ? {
                ...p,
                status: p.status === 'published' ? 'archived' : 'published',
                updated_at: now,
                updated_by: login,
              }
            : p,
        ),
      `admin: ${nextStatus === 'published' ? 'publish' : 'archive'} point ${id}`,
    );
    pointsData.value = next;
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
  pointsSaveState.value = 'saving';
  try {
    const next = await mutateFile(
      (current) => current.filter((p) => p.id !== id),
      `admin: delete point ${id}`,
    );
    pointsData.value = next;
    pointsSaveState.value = 'idle';
  } catch (e) {
    pointsSaveState.value = 'error';
    throw e;
  }
}
