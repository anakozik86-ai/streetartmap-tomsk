import { request } from './api.ts';
import { pat } from '../state/auth.ts';

export interface GitHubFile {
  sha: string;
  content: string; // base64
}

export async function getFile(owner: string, repo: string, path: string): Promise<GitHubFile> {
  return request<GitHubFile>(pat.value, `/repos/${owner}/${repo}/contents/${path}`);
}

export async function putFile(
  owner: string,
  repo: string,
  path: string,
  content: unknown[],
  sha: string,
  message: string,
): Promise<void> {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
  await request<unknown>(pat.value, `/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: encoded, sha }),
  });
}
