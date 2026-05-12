import { isAuthenticated } from './state/auth.ts';
import { LoginScreen } from './components/LoginScreen.tsx';
import { Dashboard } from './components/Dashboard.tsx';

export function App() {
  return isAuthenticated.value ? <Dashboard /> : <LoginScreen />;
}
