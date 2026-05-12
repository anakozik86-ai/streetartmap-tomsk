// Задаётся через .env: VITE_GITHUB_OWNER и VITE_GITHUB_REPO
// В vite.config.ts пробросить через define или использовать import.meta.env напрямую.
import { signal } from '@preact/signals';

export const repoOwner = signal<string>(
  (import.meta as unknown as { env: Record<string, string> }).env.VITE_GITHUB_OWNER ?? '',
);
export const repoName = signal<string>(
  (import.meta as unknown as { env: Record<string, string> }).env.VITE_GITHUB_REPO ?? '',
);
