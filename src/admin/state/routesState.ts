import { signal } from '@preact/signals';
import type { Route, ContentStatus } from '@shared/types/data.ts';
import { getFile, putFile, decodeFileJson } from '../github/contents.ts';
import { repoOwner, repoName } from './repoMeta.ts';
import { githubLogin } from './auth.ts';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const routesData = signal<Route[]>([]);
export const routesLoadState = signal<LoadState>('idle');
export const routesSaveState = signal<'idle' | 'saving' | 'error'>('idle');
export const routesError = signal<string | null>(null);

const FILENAME = 'routes.json';
const PATH = `data/${FILENAME}`;

let writeQueue: Promise<void> = Promise.resolve();
function enqueue(fn: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

async function readFile(): Promise<void> {
  const file = await getFile(repoOwner.value, repoName.value, PATH);
  routesData.value = decodeFileJson<Route[]>(file);
}

/**
 * Атомарный read-modify-write. Мутация применяется к СВЕЖЕпрочитанным с диска
 * данным ВНУТРИ очереди, поэтому конкурентные операции не затирают друг друга.
 * Возвращает записанный массив для согласования локального сигнала с диском.
 */
function mutateFile(mutate: (current: Route[]) => Route[], commitMsg: string): Promise<Route[]> {
  let result: Route[] = [];
  const done = enqueue(async () => {
    const owner = repoOwner.value;
    const repo = repoName.value;
    const fresh = await getFile(owner, repo, PATH);
    result = mutate(decodeFileJson<Route[]>(fresh));
    await putFile(owner, repo, PATH, result, fresh.sha, commitMsg);
  });
  return done.then(() => result);
}

export async function loadRoutesAdmin(): Promise<void> {
  if (routesLoadState.value === 'loading' || routesLoadState.value === 'ready') return;
  routesLoadState.value = 'loading';
  routesError.value = null;
  try {
    await readFile();
    routesLoadState.value = 'ready';
  } catch (e) {
    routesError.value = e instanceof Error ? e.message : 'Ошибка загрузки';
    routesLoadState.value = 'error';
  }
}

export function resetRoutes(): void {
  routesLoadState.value = 'idle';
}

export async function saveRoute(route: Route): Promise<void> {
  const login = githubLogin.value;
  const now = new Date().toISOString();
  routesSaveState.value = 'saving';
  try {
    const next = await mutateFile((current) => {
      const existing = current.find((r) => r.id === route.id);
      const saved: Route = {
        ...route,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        created_by: existing?.created_by ?? login,
        updated_by: login,
      };
      return existing ? current.map((r) => (r.id === saved.id ? saved : r)) : [...current, saved];
    }, `admin: upsert route ${route.id}`);
    routesData.value = next;
    routesSaveState.value = 'idle';
  } catch (e) {
    routesSaveState.value = 'error';
    throw e;
  }
}

export async function toggleRouteStatus(id: string): Promise<void> {
  const login = githubLogin.value;
  const now = new Date().toISOString();
  const route = routesData.value.find((r) => r.id === id);
  if (!route) return;

  const nextStatus: ContentStatus = route.status === 'published' ? 'archived' : 'published';
  const prev = routesData.value;
  // Оптимистично — мгновенный отклик UI; запись пересчитает статус из свежих данных.
  routesData.value = routesData.value.map((r) =>
    r.id === id ? { ...r, status: nextStatus, updated_at: now, updated_by: login } : r,
  );

  try {
    const next = await mutateFile(
      (current) =>
        current.map((r) =>
          r.id === id
            ? {
                ...r,
                status: r.status === 'published' ? 'archived' : 'published',
                updated_at: now,
                updated_by: login,
              }
            : r,
        ),
      `admin: ${nextStatus === 'published' ? 'publish' : 'archive'} route ${id}`,
    );
    routesData.value = next;
  } catch (e) {
    routesData.value = prev;
    throw e;
  }
}

export async function deleteRoute(id: string): Promise<void> {
  routesSaveState.value = 'saving';
  try {
    const next = await mutateFile(
      (current) => current.filter((r) => r.id !== id),
      `admin: delete route ${id}`,
    );
    routesData.value = next;
    routesSaveState.value = 'idle';
  } catch (e) {
    routesSaveState.value = 'error';
    throw e;
  }
}
