import { signal } from '@preact/signals';
import type { Category, Collection, Route } from '@shared/types/index.ts';
import { loadCategories, loadCollections, loadRoutes } from '@shared/utils/loadData.ts';

export const categories   = signal<Category[]>([]);
export const collections  = signal<Collection[]>([]);
export const routes       = signal<Route[]>([]);
export const catalogError = signal<string | null>(null);

let loaded = false;

export function loadCatalog(): void {
  if (loaded) return;
  loaded = true;

  Promise.all([loadCategories(), loadCollections(), loadRoutes()])
    .then(([cats, cols, rts]) => {
      categories.value  = cats.filter((c) => c.status === 'active').sort((a, b) => a.order - b.order);
      collections.value = cols.filter((c) => c.status === 'active');
      routes.value      = rts.filter((r) => r.status === 'published');
    })
    .catch(() => {
      catalogError.value = 'load_error';
    });
}
