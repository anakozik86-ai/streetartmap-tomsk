import { themeMode, type ThemeMode } from '../hooks/useTheme.ts';

interface Option {
  value: ThemeMode;
  label: string;
}

const OPTIONS: readonly Option[] = [
  { value: 'light', label: 'Светлая тема' },
  { value: 'dark', label: 'Тёмная тема' },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function iconFor(value: ThemeMode) {
  return value === 'light' ? <SunIcon /> : <MoonIcon />;
}

export function ThemeToggle() {
  return (
    <div class="theme-toggle" role="radiogroup" aria-label="Выбор темы">
      {OPTIONS.map((opt) => {
        const active = themeMode.value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            class={`theme-toggle__option${active ? ' is-active' : ''}`}
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => {
              themeMode.value = opt.value;
            }}
          >
            {iconFor(opt.value)}
          </button>
        );
      })}
    </div>
  );
}
