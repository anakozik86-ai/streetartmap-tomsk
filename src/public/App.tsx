import { Logo } from './components/Logo.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { MapView } from './components/MapView.tsx';

export function App() {
  return (
    <div class="app">
      <header class="app-header" role="banner">
        <Logo />
        <ThemeToggle />
      </header>
      <main class="app-main">
        <MapView />
      </main>
    </div>
  );
}
