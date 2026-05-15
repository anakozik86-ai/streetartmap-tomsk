# CONVENTIONS — streetartmap-tomsk

Обязательные к соблюдению паттерны. При ревью кода — проверять по этому файлу.

## TypeScript

- `strict: true` — без исключений.
- Никаких `any`. Неизвестный тип → `unknown` + narrowing.
- Явные возвращаемые типы у export-функций.
- Импорты типов через `import type`.
- `exactOptionalPropertyTypes: true` — optional поля в моделях через conditional spread при сохранении.

## Preact + Signals

- State → `signal()` / `computed()` из `@preact/signals`.
- `useState` только если signals неуместны (локальный ephemeral state внутри сложной формы).
- Глобальный state — module-level signals (как `themeMode` в `useTheme.ts`, `selectedPoint` в `selectedPoint.ts`).
- `effect()` для side-effects, `computed()` для derived state. Не вычислять в теле рендера то, что можно в `computed`.

## CSS

- **Все цвета через CSS-переменные из `tokens.css`.** Hex в компонентных CSS-файлах запрещён.
- Исключение: цвета коллекций приходят из данных (`collection.color`) и ставятся inline — это допустимо.
- Именование классов: BEM-like, блок разделён `__`, модификатор через `--`. Пример: `marker__ring`, `marker--damaged`.
- Каждый компонент/слой — свой CSS-файл, импортируется в tsx или в `main.tsx`.
- Motion: только через переменные `--duration-*` и `--ease-*` из tokens.

## Иконки

- Только из `lucide` (vanilla, не lucide-preact). Реестр в `src/public/markers/icons.ts`.
- Если в lucide нет подходящей иконки — custom SVG inline, добавить в реестр.
- Не использовать `<img>` для иконок.

## Локализация

- **UI-строки** → только через `locales/ru.json`. Не хардкодить строки в компонентах.
- Контентные строки (title, description точек) — plain string в данных, не в locales.
- Структура locales: namespace верхнего уровня (`common`, `popup`, `filters`, `states`, `accessibility`, `admin`).

## Данные

- При добавлении поля в сущность: `data.ts` → `scripts/validate-data.ts` (AJV-схема) → `data/*.json` (тестовые данные).
- Auditable-поля обязательны везде.
- Slug-идентификаторы: `kebab-case`, латиница, только `[a-z0-9-]`.
- В полях `created_by` / `updated_by` — **только** `githubLogin.value` (GitHub login). Никогда не использовать PAT-токен или его части — GitHub Secret Scanning заблокирует PUT.

## GitHub API

- Перед каждым PUT — свежий GET для получения актуального SHA. Использовать `cache: 'no-store'`.
- Параллельные PUT к одному файлу сериализовать через очередь (`enqueue`). Иначе 409 Conflict.

## Файловая структура

- Компоненты: `src/public/components/ComponentName.tsx` + `ComponentName.css` рядом (если CSS специфичен).
- Shared utilities: `src/shared/utils/`. Ничего Preact-специфичного — только pure TS.
- Shared types: `src/shared/types/data.ts`.
- Admin hooks: `src/admin/hooks/`. Общая логика для нескольких редакторов (например, `useOrderedList.ts`).
- Алиас `@shared` → `src/shared/` (настроен в `vite.config.ts` и `tsconfig.json`).

## Команды

```bash
pnpm dev              # dev-сервер http://localhost:5173
pnpm build            # tsc + vite build
pnpm validate         # format:check + lint + type-check + validate:data (всё для CI)
pnpm format           # prettier --write (fix форматирования)
pnpm lint:fix         # eslint --fix
```

## Git

- Ветка `main` — деплой. Feature-ветки для изменений, затрагивающих deploy.
- Тестовые данные в `data/` коммитятся в репо (реальные данные туда же).
- `images/` в репо (jsDelivr CDN поверх).

## Паттерны которых НЕ делаем

- Не предлагать React / Vue / Svelte / SolidJS как замену Preact.
- Не добавлять CSS-in-JS, Tailwind, styled-components.
- Не использовать сторонние UI-библиотеки (shadcn, MUI, Ant Design) для публичной части.
- Не вводить дополнительные state-менеджеры (Redux, Zustand, Jotai).
- Не генерировать JSON-схемы из TS-типов автоматически (пока ручная синхронизация).
