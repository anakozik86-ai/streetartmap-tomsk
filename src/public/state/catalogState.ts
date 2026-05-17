import { signal } from '@preact/signals';
import type { Author, Category, Collection, Route } from '@shared/types/index.ts';
import {
  loadAuthors,
  loadCategories,
  loadCollections,
  loadRoutes,
} from '@shared/utils/loadData.ts';

export const categories = signal<Category[]>([]);
export const collections = signal<Collection[]>([]);
export const authors = signal<Author[]>([]);
export const routes = signal<Route[]>([]);
export const catalogError = signal<string | null>(null);

let loaded = false;

export function loadCatalog(): void {
  if (loaded) return;
  loaded = true;

  Promise.all([loadCategories(), loadCollections(), loadAuthors(), loadRoutes()])
    .then(([cats, cols, auths, rts]) => {
      categories.value = cats
        .filter((c) => c.status === 'active')
        .sort((a, b) => a.order - b.order);
      collections.value = cols.filter((c) => c.status === 'active');
      authors.value = auths.filter((a) => a.status === 'active');
      routes.value = rts.filter((r) => r.status === 'published');
    })
    .catch(() => {
      catalogError.value = 'load_error';
    });
}
