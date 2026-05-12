import { useState, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { logout } from '../state/auth.ts';
import { loadCatalog, loadState, catalogError, resetCatalog } from '../state/catalog.ts';
import { CategoriesEditor } from './CategoriesEditor.tsx';
import { CollectionsEditor } from './CollectionsEditor.tsx';
import { AuthorsEditor } from './AuthorsEditor.tsx';
import './Dashboard.css';

type Section = 'categories' | 'collections' | 'authors' | 'points' | 'routes';

const NAV: { id: Section; label: string }[] = [
  { id: 'categories', label: 'Категории' },
  { id: 'collections', label: 'Коллекции' },
  { id: 'authors', label: 'Авторы' },
  { id: 'points', label: 'Точки' },
  { id: 'routes', label: 'Маршруты' },
];

export function Dashboard(): JSX.Element {
  const [section, setSection] = useState<Section>('categories');

  useEffect(() => {
    loadCatalog();
  }, []);

  const state = loadState.value;

  return (
    <div class="dashboard">
      <header class="dashboard__header">
        <span class="dashboard__logo">streetartmap</span>
        <nav class="dashboard__nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              class={`dashboard__nav-btn${section === n.id ? ' is-active' : ''}`}
              onClick={() => setSection(n.id)}
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
            {(section === 'points' || section === 'routes') && (
              <div class="dashboard__stub">Этот раздел появится в следующем этапе.</div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
