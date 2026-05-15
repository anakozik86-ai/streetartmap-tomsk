import { signal } from '@preact/signals';
import type { Route, ContentStatus } from '@shared/types/data.ts';
import { getFile, putFile } from '../github/contents.ts';
import { repoOwner, repoName } from './repoMeta.ts';
import { githubLogin } from './auth.ts';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const routesData = signal<Route[]>([]);
export const routesLoadState = signal<LoadState>('idle');
export const routesSaveState = signal<'idle' | 'saving' | 'error'>('idle');
export const routesError = signal<string | null>(null);

const shaCache: Record<string, string> = {};
const FILENAME = 'routes.json';

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
  routesData.value = JSON.parse(new TextDecoder().decode(bytes)) as Route[];
}

function writeFile(next: Route[], commitMsg: string): Promise<void> {
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
  const list = routesData.value;
  const existing = list.find((r) => r.id === route.id);
  const saved: Route = {
    ...route,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    created_by: existing?.created_by ?? login,
    updated_by: login,
  };
  const next = existing ? list.map((r) => (r.id === saved.id ? saved : r)) : [...list, saved];

  routesSaveState.value = 'saving';
  try {
    await writeFile(next, `admin: upsert route ${saved.id}`);
    routesData.value = next;
    routesSaveState.value = 'idle';
  } catch (e) {
    routesSaveState.value = 'error';
    throw e;
  }
}

/** Legacy — оставлен для совместимости. */
export async function archiveRoute(id: string): Promise<void> {
  const login = githubLogin.value;
  const now = new Date().toISOString();
  const next = routesData.value.map((r) =>
    r.id === id
      ? { ...r, status: 'archived' as ContentStatus, updated_at: now, updated_by: login }
      : r,
  );
  routesSaveState.value = 'saving';
  try {
    await writeFile(next, `admin: archive route ${id}`);
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
  const optimistic = routesData.value.map((r) =>
    r.id === id ? { ...r, status: nextStatus, updated_at: now, updated_by: login } : r,
  );
  const prev = routesData.value;
  routesData.value = optimistic;

  try {
    await writeFile(
      optimistic,
      `admin: ${nextStatus === 'published' ? 'publish' : 'archive'} route ${id}`,
    );
  } catch (e) {
    routesData.value = prev;
    throw e;
  }
}

export async function deleteRoute(id: string): Promise<void> {
  const next = routesData.value.filter((r) => r.id !== id);
  routesSaveState.value = 'saving';
  try {
    await writeFile(next, `admin: delete route ${id}`);
    routesData.value = next;
    routesSaveState.value = 'idle';
  } catch (e) {
    routesSaveState.value = 'error';
    throw e;
  }
}
