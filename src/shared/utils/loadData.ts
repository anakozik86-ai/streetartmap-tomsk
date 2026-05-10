import type { Author, Category, Collection, Point, Route } from '../types/index.ts';

const cache = new Map<string, Promise<unknown>>();

/**
 * Загрузка одного из data/*.json массивов с кэшированием на время вкладки.
 * Сетевой кэш обеспечивает GitHub Pages/CDN; внутри SPA — этот Map.
 */
export function loadJsonArray<T>(filename: string): Promise<T[]> {
  const existing = cache.get(filename);
  if (existing) return existing as Promise<T[]>;

  const promise = fetch(`${import.meta.env.BASE_URL}data/${filename}`).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to load ${filename}: ${res.status} ${res.statusText}`);
    }
    return res.json();
  });
  cache.set(filename, promise);
  return promise as Promise<T[]>;
}

export const loadCategories = (): Promise<Category[]> => loadJsonArray<Category>('categories.json');
export const loadCollections = (): Promise<Collection[]> =>
  loadJsonArray<Collection>('collections.json');
export const loadAuthors = (): Promise<Author[]> => loadJsonArray<Author>('authors.json');
export const loadPoints = (): Promise<Point[]> => loadJsonArray<Point>('points.json');
export const loadRoutes = (): Promise<Route[]> => loadJsonArray<Route>('routes.json');
