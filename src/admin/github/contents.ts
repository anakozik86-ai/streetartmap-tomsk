import { request } from './api.ts';
import { pat } from '../state/auth.ts';

export interface GitHubFile {
  sha: string;
  content: string; // base64
}

export async function getFile(owner: string, repo: string, path: string): Promise<GitHubFile> {
  const file = await request<GitHubFile>(pat.value, `/repos/${owner}/${repo}/contents/${path}`);
  // Contents API возвращает пустой content для файлов > 1 МБ. В этом случае
  // догружаем содержимое через Blobs API по SHA (лимит 100 МБ) — иначе
  // decodeFileJson упал бы на JSON.parse("") при росте points.json.
  if (!file.content && file.sha) {
    const blob = await request<{ content: string }>(
      pat.value,
      `/repos/${owner}/${repo}/git/blobs/${file.sha}`,
    );
    return { sha: file.sha, content: blob.content };
  }
  return file;
}

/** Декодирует base64-JSON файл из GitHub Contents API в типизированное значение. */
export function decodeFileJson<T>(file: GitHubFile): T {
  const binary = atob(file.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function putFile(
  owner: string,
  repo: string,
  path: string,
  content: unknown[],
  sha: string,
  message: string,
): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(content, null, 2));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const encoded = btoa(binary);
  await request<unknown>(pat.value, `/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: encoded, sha }),
  });
}

/**
 * Get the current SHA of a file without fetching its content.
 * Returns '' if the file does not exist (404).
 * Throws for other errors.
 */
export async function getFileSha(
  owner: string,
  repo: string,
  path: string,
  token: string,
): Promise<string> {
  try {
    const file = await request<GitHubFile>(token, `/repos/${owner}/${repo}/contents/${path}`);
    return file.sha;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'status' in err &&
      (err as { status: number }).status === 404
    ) {
      return '';
    }
    throw err;
  }
}

/**
 * Upload a binary file (already base64-encoded) to the repo.
 * Pass sha='' for a new file, or the current SHA for an update.
 */
export async function putBinaryFile(
  owner: string,
  repo: string,
  path: string,
  base64Content: string,
  sha: string,
  token: string,
  message: string,
): Promise<void> {
  const body: Record<string, string> = { message, content: base64Content };
  if (sha) body['sha'] = sha;
  await request<unknown>(token, `/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
