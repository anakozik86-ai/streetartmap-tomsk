import { render } from 'preact';

// Заглушка админки. Полная реализация — на этапах 7–9
// (логин по PAT, редактор справочников, точек, маршрутов).

function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'Onest, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', margin: 0 }}>streetartmap — админка</h1>
      <p style={{ color: '#8A8E94' }}>
        Каркас собран. Логин и редакторы появятся на следующих этапах.
      </p>
    </div>
  );
}

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');
render(<App />, root);
