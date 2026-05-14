import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { currentRoute, navigate, type AdminSection } from '../state/router.ts';
import { logout } from '../state/auth.ts';
import { loadCatalog, loadState, catalogError, resetCatalog } from '../state/catalog.ts';
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

export function Dashboard(): JSX.Element {
  const route = currentRoute.value;
  const section = route.section === 'dashboard' ? 'categories' : route.section;

  useEffect(() => {
    loadCatalog();
  }, []);

  const state = loadState.value;

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
