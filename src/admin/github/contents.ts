import { request } from './api.ts';

export interface GitHubFile {
  sha: string;
  content: string; // base64
}

export async function getFile(owner: string, repo: string, path: string): Promise<GitHubFile> {
  const data = await request<GitHubFile>(`/repos/${owner}/${repo}/contents/${path}`);
  return data;
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
  await request(`/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: encoded, sha }),
  });
}
