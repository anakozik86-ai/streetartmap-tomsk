import { signal, computed } from '@preact/signals';

const STORAGE_KEY = 'streetartmap_pat';

export const pat = signal<string>(localStorage.getItem(STORAGE_KEY) ?? '');
export const isAuthenticated = computed(() => pat.value.length > 0);

export function savePat(token: string): void {
  pat.value = token;
  localStorage.setItem(STORAGE_KEY, token);
}

export function logout(): void {
  pat.value = '';
  localStorage.removeItem(STORAGE_KEY);
}
