import { render } from 'preact';
import { App } from './App.tsx';

// Стили — порядок важен: токены → база → карта → app-уровень
import './styles/tokens.css';
import './styles/base.css';
import './styles/map.css';
import './styles/markers.css';
import './styles/app.css';

// Инициализируем тему (импорт инициализирует signals и подписки)
import './hooks/useTheme.ts';

const root = document.getElementById('app');
if (!root) throw new Error('#app element not found in DOM');
render(<App />, root);
