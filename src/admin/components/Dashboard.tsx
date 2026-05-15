import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { currentRoute, navigate, type AdminSection } from '../state/router.ts';
import { logout } from '../state/auth.ts';
import { loadCatalog, loadState, catalogError, resetCatalog } from '../state/catalog.ts';
import { themeMode } from '../../public/hooks/useTheme.ts';
import { CategoriesEditor } from './CategoriesEditor.tsx';
import { CollectionsEditor } from './CollectionsEditor.tsx';
import { AuthorsEditor } from './AuthorsEditor.tsx';
import { PointsEditor } from './PointsEditor.tsx';
import { PointForm } from './PointForm.tsx';
import { RoutesEditor } from './RoutesEditor.tsx';
import { RouteForm } from './RouteForm.tsx';
import './Dashboard.css';

type Section = AdminSection;

const NAV: { id: Section; label: string }[] = [
  { id: 'categories', label: 'Категории' },
  { id: 'collections', label: 'Коллекции' },
  { id: 'authors', label: 'Авторы' },
  { id: 'points', label: 'Точки' },
  { id: 'routes', label: 'Маршруты' },
];

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function Dashboard(): JSX.Element {
  const route = currentRoute.value;
  const section = route.section === 'dashboard' ? 'categories' : route.section;

  useEffect(() => {
    loadCatalog();
  }, []);

  const state = loadState.value;
  const isDark = themeMode.value === 'dark';

  // Full-screen overlays рендерятся вне основного layout
  if (route.section === 'points' && route.id !== null) {
    return <PointForm pointId={route.id} />;
  }
  if (route.section === 'routes' && route.id !== null) {
    return <RouteForm routeId={route.id} />;
  }

  return (
    <div class="dashboard">
      <header class="dashboard__header">
        <span class="dashboard__logo">streetartmap</span>
        <nav class="dashboard__nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              class={`dashboard__nav-btn${section === n.id ? ' is-active' : ''}`}
              onClick={() => navigate(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <button
          class="dashboard__theme-btn"
          title={isDark ? 'Светлая тема' : 'Тёмная тема'}
          onClick={() => {
            themeMode.value = isDark ? 'light' : 'dark';
          }}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
        <button class="dashboard__logout" onClick={logout}>
          Выйти
        </button>
      </header>

      <main class="dashboard__main">
        {state === 'loading' && <div class="dashboard__loader">Загрузка…</div>}
        {state === 'error' && (
          <div class="dashboard__error">
            <p>{catalogError.value}</p>
            <button
              class="admin-btn admin-btn--ghost"
              onClick={() => {
                resetCatalog();
                loadCatalog();
              }}
            >
              Повторить
            </button>
          </div>
        )}
        {state === 'ready' && (
          <>
            {section === 'categories' && <CategoriesEditor />}
            {section === 'collections' && <CollectionsEditor />}
            {section === 'authors' && <AuthorsEditor />}
            {section === 'points' && <PointsEditor />}
            {section === 'routes' && <RoutesEditor />}
          </>
        )}
      </main>
    </div>
  );
}
