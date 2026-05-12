import { signal, computed } from '@preact/signals';

export const activeCategories = signal<ReadonlySet<string>>(new Set());
export const activeCollections = signal<ReadonlySet<string>>(new Set());
export const showLost = signal<boolean>(false);

export const hasActiveFilters = computed(
  () =>
    activeCategories.value.size > 0 ||
    activeCollections.value.size > 0 ||
    showLost.value,
);

export function resetFilters(): void {
  activeCategories.value = new Set();
  activeCollections.value = new Set();
  showLost.value = false;
}

/** Toggle-хелперы — иммутабельно, чтобы computed обновлялись корректно. */
export function toggleCategory(id: string): void {
  const next = new Set(activeCategories.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  activeCategories.value = next;
}

export function toggleCollection(id: string): void {
  const next = new Set(activeCollections.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  activeCollections.value = next;
}
