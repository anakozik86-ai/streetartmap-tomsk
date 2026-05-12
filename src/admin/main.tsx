import { render } from 'preact';
// CSS — порядок критичен: токены первыми
import '../public/styles/tokens.css';
import '../public/styles/base.css';
import './components/Modal.css';
import './components/AdminForm.css';
import './components/AdminTable.css';
import './components/Dashboard.css';
import { App } from './App.tsx';

render(<App />, document.getElementById('app')!);
