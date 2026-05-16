import { signal, computed } from '@preact/signals';

const STORAGE_KEY = 'streetartmap_pat';
const LOGIN_KEY = 'streetartmap_login';

export const pat = signal<string>(localStorage.getItem(STORAGE_KEY) ?? '');
export const githubLogin = signal<string>(localStorage.getItem(LOGIN_KEY) ?? '');

/**
 * Оба значения должны быть непустыми.
 * Защита от ситуации когда PAT восстановлен из localStorage,
 * но LOGIN_KEY отсутствует (старая сессия до фикса).
 */
export const isAuthenticated = computed(() => pat.value.length > 0 && githubLogin.value.length > 0);

export function savePat(token: string, login: string): void {
  pat.value = token;
  githubLogin.value = login;
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem(LOGIN_KEY, login);
}

export function logout(): void {
  pat.value = '';
  githubLogin.value = '';
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOGIN_KEY);
}

/**
 * Вызывается при старте приложения.
 * Если PAT есть, но логин отсутствует — восстанавливаем логин через GitHub API.
 * Если PAT невалиден — разлогиниваем.
 */
export async function restoreSession(
  getUser: (token: string) => Promise<{ login: string }>,
): Promise<void> {
  if (!pat.value) return;
  if (githubLogin.value) return;

  try {
    const user = await getUser(pat.value);
    githubLogin.value = user.login;
    localStorage.setItem(LOGIN_KEY, user.login);
  } catch {
    logout();
  }
}
