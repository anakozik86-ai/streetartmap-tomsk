import { Logo } from './components/Logo.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { MapView } from './components/MapView.tsx';
import { PointPopup } from './components/PointPopup.tsx';
import { FilterPanel } from './components/FilterPanel.tsx';
import { selectedPoint } from './state/selectedPoint.ts';

export function App() {
  return (
    <div class="app">
      <header class="app-header" role="banner">
        <Logo />
        <ThemeToggle />
      </header>
      <main class={`app-main${selectedPoint.value ? ' has-popup' : ''}`}>
        <MapView />
        <FilterPanel />
        <PointPopup />
      </main>
    </div>
  );
}
