import { render } from 'preact';
// CSS — порядок критичен: токены первыми
import '../public/styles/tokens.css';
import '../public/styles/base.css';
import '../public/styles/markers.css';
import './components/Modal.css';
import './components/AdminForm.css';
import './components/AdminTable.css';
import './components/PointsEditor.css';
import './components/PointForm.css';
import './components/RoutesEditor.css';
import './components/RouteForm.css';
import './components/Dashboard.css';
import { App } from './App.tsx';

render(<App />, document.getElementById('app')!);
