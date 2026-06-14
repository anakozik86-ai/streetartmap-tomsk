import { useEffect, useRef, useState } from 'preact/hooks';
import {
  loadCatalog,
  categories,
  collections,
  routes,
  catalogError,
} from '../state/catalogState.ts';
import {
  activeCategories,
  activeCollections,
  showLost,
  hasActiveFilters,
  resetFilters,
  toggleCategory,
  toggleCollection,
} from '../state/filters.ts';
import { activeRouteIds, toggleRoute } from '../state/routes.ts';
import { resolveIcon, renderIconSvg } from '../markers/icons.ts';
import ru from '../../../locales/ru.json';

/** Считает суммарное количество активных фильтров для бейджа */
function countActiveFilters(): number {
  return (
    activeCategories.value.size +
    activeCollections.value.size +
    activeRouteIds.value.size +
    (showLost.value ? 1 : 0)
  );
}

export function FilterPanel() {
  useEffect(() => {
    loadCatalog();
  }, []);

  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const activeCount = countActiveFilters();

  const closeSheet = () => setSheetOpen(false);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    let startY = 0;
    let isDragging = false;

    function onStart(e: TouchEvent) {
      if (!sheetOpen) return;
      const body = el!.querySelector('.filter-sheet__body') as HTMLElement | null;
      if (body && body.scrollTop > 2) return;
      startY = e.touches[0].clientY;
      isDragging = true;
      el!.style.transition = 'none';
    }

    function onMove(e: TouchEvent) {
      if (!isDragging) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { isDragging = false; el!.style.transform = ''; el!.style.transition = ''; return; }
      e.preventDefault();
      el!.style.transform = `translateY(${dy}px)`;
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      const match = el!.style.transform.match(/translateY\((\d+(?:\.\d+)?)px\)/);
      const dy = match ? parseFloat(match[1]) : 0;
      el!.style.transform = '';
      el!.style.transition = '';
      if (dy > 80) setSheetOpen(false);
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [sheetOpen]);

  return (
    <>
      {/* ── Десктоп: боковая панель ── */}
      <aside class="filter-panel filter-panel--desktop" aria-label={ru.filters.title}>
        {catalogError.value && <p class="filter-panel__error">{ru.filters.load_error}</p>}

        <section class="filter-panel__section">
          <p class="filter-panel__label">{ru.filters.categories}</p>
          {categories.value.map((cat) => {
            const active = activeCategories.value.has(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                class={`filter-panel__item${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleCategory(cat.id)}
              >
                <span
                  class="filter-panel__item-icon"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{
                    __html: renderIconSvg(resolveIcon(cat.icon), 'filter-panel__icon'),
                  }}
                />
                <span class="filter-panel__item-label">{cat.name}</span>
              </button>
            );
          })}
        </section>

        <section class="filter-panel__section">
          {collections.value.length > 0 && <p class="filter-panel__label">{ru.filters.festivals}</p>}
          {collections.value.map((col) => {
            const active = activeCollections.value.has(col.id);
            return (
              <button
                key={col.id}
                type="button"
                class={`filter-panel__item${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleCollection(col.id)}
              >
                <span
                  class="filter-panel__item-dot"
                  style={{ background: col.color }}
                  aria-hidden="true"
                />
                <span class="filter-panel__item-label">{col.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            class={`filter-panel__item${showLost.value ? ' is-active' : ''}`}
            aria-pressed={showLost.value}
            onClick={() => {
              showLost.value = !showLost.value;
            }}
          >
            <span
              class="filter-panel__item-dot filter-panel__item-dot--lost"
              aria-hidden="true"
            />
            <span class="filter-panel__item-label">{ru.filters.show_lost}</span>
          </button>
        </section>

        {routes.value.length > 0 && (
          <section class="filter-panel__section">
            <p class="filter-panel__label">{ru.filters.routes}</p>
            {routes.value.map((route) => {
              const active = activeRouteIds.value.has(route.id);
              return (
                <button
                  key={route.id}
                  type="button"
                  class={`filter-panel__item${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleRoute(route.id)}
                >
                  <span class="filter-panel__item-label">{route.name}</span>
                </button>
              );
            })}
          </section>
        )}

        {hasActiveFilters.value && (
          <button type="button" class="filter-panel__reset" onClick={resetFilters}>
            {ru.filters.reset}
          </button>
        )}
      </aside>

      {/* ── Мобайл: кнопка + bottom sheet ── */}
      <div class="filter-fab-wrap">
        <button
          type="button"
          class={`filter-fab${activeCount > 0 ? ' has-active' : ''}`}
          onClick={() => setSheetOpen(true)}
          aria-label={ru.filters.title}
          aria-expanded={sheetOpen}
        >
          <svg class="filter-fab__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span class="filter-fab__label">{ru.filters.title}</span>
          {activeCount > 0 && (
            <span class="filter-fab__badge" aria-label={`${activeCount} активных фильтров`}>
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Bottom sheet */}
      {sheetOpen && <div class="filter-sheet-backdrop" onClick={closeSheet} aria-hidden="true" />}
      <div
        ref={sheetRef}
        class={`filter-sheet${sheetOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ru.filters.title}
      >
        {/* Шапка листа */}
        <div class="filter-sheet__header">
          <span class="filter-sheet__handle" aria-hidden="true" />
          <span class="filter-sheet__title">{ru.filters.title}</span>
          {hasActiveFilters.value && (
            <button
              type="button"
              class="filter-sheet__reset"
              onClick={() => {
                resetFilters();
              }}
            >
              {ru.filters.reset}
            </button>
          )}
        </div>

        <div class="filter-sheet__body">
          {catalogError.value && <p class="filter-panel__error">{ru.filters.load_error}</p>}

          {/* Типы */}
          <section class="filter-sheet__section">
            <p class="filter-sheet__label">{ru.filters.categories}</p>
            <div class="filter-sheet__chips">
              {categories.value.map((cat) => {
                const active = activeCategories.value.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    class={`filter-sheet__chip${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleCategory(cat.id)}
                  >
                    <span
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{
                        __html: renderIconSvg(resolveIcon(cat.icon), 'filter-sheet__chip-icon'),
                      }}
                    />
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Коллекции + утраченные */}
          <section class="filter-sheet__section">
            {collections.value.length > 0 && <p class="filter-sheet__label">{ru.filters.festivals}</p>}
            <div class="filter-sheet__chips">
              {collections.value.map((col) => {
                const active = activeCollections.value.has(col.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    class={`filter-sheet__chip${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleCollection(col.id)}
                  >
                    <span
                      class="filter-sheet__chip-dot"
                      style={{ background: col.color }}
                      aria-hidden="true"
                    />
                    {col.name}
                  </button>
                );
              })}
              <button
                type="button"
                class={`filter-sheet__chip${showLost.value ? ' is-active' : ''}`}
                aria-pressed={showLost.value}
                onClick={() => { showLost.value = !showLost.value; }}
              >
                <span
                  class="filter-sheet__chip-dot filter-sheet__chip-dot--lost"
                  aria-hidden="true"
                />
                {ru.filters.show_lost}
              </button>
            </div>
          </section>

          {/* Маршруты */}
          {routes.value.length > 0 && (
            <section class="filter-sheet__section">
              <p class="filter-sheet__label">{ru.filters.routes}</p>
              <div class="filter-sheet__chips">
                {routes.value.map((route) => {
                  const active = activeRouteIds.value.has(route.id);
                  return (
                    <button
                      key={route.id}
                      type="button"
                      class={`filter-sheet__chip${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => toggleRoute(route.id)}
                    >
                      {route.name}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
