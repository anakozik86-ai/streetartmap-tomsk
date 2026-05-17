# ARCHITECTURE — streetartmap-tomsk

Зафиксированные решения. Изменения только через явный PR + обновление этого файла.

## Цели

- **Бесплатно** — без серверов, без платных сервисов в основном пути.
- **Масштабируемо** — модель данных одинаковая для любого города, не упирается в 50 точек.
- **Удобно для редакторов** — кастомная админка, визуальные редакторы точек и маршрутов.
- **Версионируемо** — все данные в git, history и audit trail бесплатно.

## Стек (зафиксирован, не менять без PR)

| Слой      | Решение                       | Версия        |
| --------- | ----------------------------- | ------------- |
| Фреймворк | Preact + @preact/signals      | ^10.22 / ^1.3 |
| Сборка    | Vite + TypeScript (strict)    | ^5.4 / ^5.6   |
| Карта     | Leaflet                       | ^1.9.4        |
| Тайлы     | CartoDB Voyager / Dark Matter | —             |
| Маршруты  | OSRM public (foot) + кэш      | —             |
| Иконки    | lucide (vanilla)              | ^0.468.0      |
| Валидация | AJV + ajv-formats в CI        | ^8 / ^3       |
| Пакеты    | pnpm                          | ^9.10         |
| Хостинг   | GitHub Pages + GitHub Actions | —             |
| Фото CDN  | jsDelivr поверх GitHub repo   | —             |
| Auth      | GitHub Personal Access Token  | —             |

## Архитектурные решения

| #   | Решение                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Админка — кастомная Preact SPA (не Decap/Sveltia)                                                                                                                                                                             |
| 2   | Auth — GitHub PAT, без OAuth-прокси                                                                                                                                                                                           |
| 3   | Фото — в репо `images/`, CDN jsDelivr, при загрузке генерируем 3 размера. Слой `storage` для миграции                                                                                                                         |
| 4   | Маршруты — OSRM public foot, кэш geometry в `routes.json`, fallback на прямые линии                                                                                                                                           |
| 5   | Локализация — UI-строки в `locales/ru.json`, контент plain string, миграция на i18n позже                                                                                                                                     |
| 6   | Публикация — публичный репо, `status: published/archived` у точек и маршрутов. Дефолт новой записи — `archived`; toggle на `published` после готовности                                                                       |
| 7   | Категории — 4 фиксированных: mural, graffiti, mosaic, other. Иконка = категория. Список сокращён в 11e с 8 до 4 (удалены stencil, paste-up, sticker, sculpture как неиспользуемые)                                            |
| 8   | Коллекции — объединены `festival + series` через поле `type`. Цвет(а) обводки маркера = коллекции, conic-gradient до 4 видимых сегментов                                                                                      |
| 9   | Утраченные (`painted_over`/`removed`) — скрыты по умолчанию, переключатель делает видимыми с пониженной непрозрачностью                                                                                                       |
| 10  | Авторы — справочник `authors.json` (slug-id), не свободная строка. С 11d у точки несколько равноправных соавторов через `author_ids: string[]`, порядок = порядок отображения в UI                                            |
| 11  | Справочники (Category/Collection/Author) — без статуса в UI, в JSON всегда `status: 'active'`. Удаление возможно только при отсутствии ссылок из точек                                                                        |
| 12  | Тема — только light/dark (без system-режима). Дефолт по prefers-color-scheme при первом заходе. FOUC гасится inline-скриптом в `index.html`                                                                                   |
| 13  | Макет — карта на весь экран, плавающие панели поверх (вариант A). Адаптив: десктоп + мобайл                                                                                                                                   |
| 14  | Многогородье — каждый город = отдельный репо с одинаковой структурой                                                                                                                                                          |
| 15  | Плавный зум колесом — кастомный `SmoothWheelZoom` handler поверх Leaflet (приватный `_move()` + clamp по minZoom/maxZoom). Стандартный wheelZoom отключён                                                                     |
| 16  | Порядок записей в редакторах — хранится в localStorage по вкладкам (`streetartmap.order.{tab}`), не пушится в JSON. Три режима: published-first / archived-first / custom                                                     |
| 17  | Multi-author (11d) — `Point.author_ids: string[]`. Пустой массив = автор не указан. Соавторы равноправны (без иерархии main/co). UI multi-select через `AuthorChips`, порядок выбора = порядок отображения в публичном попапе |

## Дизайн-система (зафиксирована)

**Палитра:**

- Фон light: `#F7F5F0` / dark: `#0E1116`
- Акцент: `#B8FF3D` (кислотно-зелёный)
- Damaged: `#E8A338` / Lost: `#8A8E94`

**Шрифты:**

- Тело: Onest (font-body)
- Заголовки/логотип: Unbounded (font-display)

**Логотип:** wordmark `streetartmap` строчными в Unbounded.

**Тайлы:** CartoDB Voyager (light) + Dark Matter (dark).

**Целевой экран:** MacBook Pro 16" 2560×1664.

Все токены — в `src/public/styles/tokens.css`. Хардкодить цвета в компонентах запрещено.

## Структура репо

```
streetartmap-tomsk/
├── index.html                   # entry публичной страницы
├── admin/index.html             # entry админки
├── src/
│   ├── public/                  # код публичной части
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/          # MapView, ThemeToggle, Logo, FilterPanel, PointPopup, RouteLayer, SmoothWheelZoom
│   │   ├── hooks/               # useTheme
│   │   ├── markers/             # icons.ts, createMarker.ts
│   │   ├── state/               # selectedPoint, filters, routes, catalogState
│   │   └── styles/              # base.css, app.css, tokens.css, map.css, markers.css
│   ├── admin/                   # код админки
│   │   ├── App.tsx, main.tsx
│   │   ├── components/          # LoginScreen, Dashboard, *Editor, *Form, Modal, ReferencesModal, SortBar, routing/
│   │   ├── github/              # api.ts, contents.ts
│   │   ├── hooks/               # useOrderedList.ts
│   │   ├── state/               # auth, repoMeta, catalog, pointsState, routesState, router, orderState
│   │   └── types/               # lrm.d.ts
│   └── shared/
│       ├── types/               # data.ts, index.ts
│       └── utils/               # loadConfig.ts, loadData.ts
├── data/                        # JSON-источники
│   ├── config.json
│   ├── categories.json
│   ├── collections.json
│   ├── authors.json
│   ├── points.json
│   └── routes.json
├── images/                      # фото (пусто в dev)
├── locales/ru.json              # UI-словарь
├── scripts/validate-data.ts     # AJV-валидатор для CI
├── docs/                        # документация репо: ARCHITECTURE, DATA-MODEL, CONVENTIONS, EDITORS, ADD-CITY
├── .github/workflows/           # deploy.yml + validate.yml
└── vite.config.ts, tsconfig.json, eslint.config.js, .prettierrc
```

Дополнительные документы для контекста Claude (не в репо): `CORE-CODE.md`, `STATUS.md`, `AGENT-RULES.md`.

## Поток данных

```
Редактор (admin SPA, login по PAT)
    │ GitHub Contents API (чтение и запись JSON, фото)
    ▼
Репозиторий GitHub (data/*.json + images/*)
    │ push в main
    ▼
GitHub Actions: validate (AJV) + build (Vite)
    │ deploy
    ▼
GitHub Pages (публичный сайт, читает /data/*.json через fetch)
```

## Принципы модели данных

- **`status` и `state` ортогональны.** `status` — публикационный (`published/archived`). `state` — физическое состояние (`intact/damaged/restored/painted_over/removed/unknown`).
- **Категория ≠ обводка.** Категория → иконка маркера. Цвет обводки → коллекции.
- **Slug-идентификаторы** во всех сущностях — URL-friendly, читаемы в diff'ах.
- **TS-типы в `src/shared/types/data.ts` — источник правды.** JSON-схемы поддерживаются в соответствии с ними.
- **Auditable-поля обязательны** на всех сущностях: `created_at`, `updated_at`, `created_by`, `updated_by`.
