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

async function request<T>(pat: string, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `token ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new GitHubApiError(res.status, `GitHub API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export function getAuthenticatedUser(pat: string): Promise<GitHubUser> {
  return request<GitHubUser>(pat, '/user');
}
