export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export async function request<T>(pat: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `token ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init?.headers,
    },
  });
  if (!res.ok) throw new GitHubApiError(res.status, `GitHub API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export function getAuthenticatedUser(pat: string): Promise<GitHubUser> {
  return request<GitHubUser>(pat, '/user');
}
