import type { SiteConfig } from '../types/index.ts';

let cached: Promise<SiteConfig> | null = null;

/**
 * Загрузка глобального конфига сайта.
 * Кэшируется на время жизни вкладки.
 */
export function loadConfig(): Promise<SiteConfig> {
  if (cached) return cached;

  cached = fetch(`${import.meta.env.BASE_URL}data/config.json`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load config: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<SiteConfig>;
    })
    .catch((err) => {
      // Не кэшируем сбой — следующий вызов повторит запрос.
      cached = null;
      throw err;
    });

  return cached;
}
