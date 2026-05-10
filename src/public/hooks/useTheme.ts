import { signal, effect } from '@preact/signals';

export type ThemeMode = 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'streetartmap.theme';

function detectSystemPreference(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // localStorage недоступен (приватный режим, безопасность) — fallback
  }
  // Первый запуск — берём системную тему как стартовую,
  // дальше пользователь сам выбирает явно.
  return detectSystemPreference();
}

/** Активный режим темы (выбор пользователя). */
export const themeMode = signal<ThemeMode>(loadStoredMode());

/** Реальная применённая тема — для двухрежимного toggle совпадает с themeMode. */
export const effectiveTheme = signal<EffectiveTheme>(themeMode.value);

// Применение к <html> и сохранение выбора
effect(() => {
  const mode = themeMode.value;
  effectiveTheme.value = mode;
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // не критично
  }
});

/** Переключить тему между light и dark. */
export function toggleTheme(): void {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark';
}
