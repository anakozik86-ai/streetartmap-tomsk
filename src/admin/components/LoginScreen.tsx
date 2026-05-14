import { useState } from 'preact/hooks';
import { savePat } from '../state/auth.ts';
import { getAuthenticatedUser, GitHubApiError } from '../github/api.ts';
import './LoginScreen.css';

export function LoginScreen() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const token = value.trim();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const user = await getAuthenticatedUser(token);
      savePat(token, user.login);
    } catch (e) {
      if (e instanceof GitHubApiError && e.status === 401) {
        setError('Неверный токен. Проверь PAT и повтори.');
      } else if (e instanceof GitHubApiError && e.status === 403) {
        setError('Токен не имеет нужных прав. Нужен scope contents:write.');
      } else {
        setError('Ошибка соединения с GitHub.');
      }
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') void handleSubmit();
  }

  return (
    <div class="login">
      <div class="login__card">
        <div class="login__logo">streetartmap</div>
        <p class="login__hint">Введи GitHub Personal Access Token с правом записи в репозиторий.</p>
        <div class="login__field">
          <input
            class={`login__input${error ? ' login__input--error' : ''}`}
            type="password"
            placeholder="github_pat_..."
            value={value}
            onInput={(e) => setValue((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            aria-label="GitHub Personal Access Token"
            autocomplete="off"
            spellcheck={false}
          />
        </div>
        {error && (
          <p class="login__error" role="alert">
            {error}
          </p>
        )}
        <button
          class="login__btn"
          onClick={() => void handleSubmit()}
          disabled={loading || !value.trim()}
        >
          {loading ? 'Проверка…' : 'Войти'}
        </button>
      </div>
    </div>
  );
}
