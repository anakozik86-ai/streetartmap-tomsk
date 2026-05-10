# streetartmap

Карта стрит-арта Томска. Бесплатный, статический, открытый сайт с админкой
для редактирования. Хостинг на GitHub Pages, фото и данные в этом же репо.

## Стек

- **Preact** + `@preact/signals` — публичная страница и админка
- **Leaflet** + **OpenStreetMap** (тайлы CartoDB) — карта
- **Vite** + **TypeScript** — сборка
- **OSRM public** — пешеходные маршруты, кэшируем геометрию
- **GitHub Pages** — хостинг
- **GitHub Actions** — CI/CD
- **AJV** — валидация JSON-данных перед деплоем

## Установка

Требуется Node.js 20+ и pnpm 9+.

```bash
pnpm install
```

## Разработка

```bash
pnpm dev          # http://localhost:5173 — публичная страница
                  # http://localhost:5173/admin/ — админка
```

## Сборка

```bash
pnpm build        # output: dist/
pnpm preview      # просмотр продакшен-сборки
```

## Валидация

Перед каждым коммитом и в CI:

```bash
pnpm validate     # type-check + lint + проверка JSON в data/
pnpm validate:data  # только проверка JSON
```

CI запускает то же на каждый PR (`validate.yml`) и push в main (`deploy.yml`).
Деплой блокируется при любой ошибке валидации.

## Структура проекта

```
streetartmap-tomsk/
├── index.html              # entry публичной страницы
├── admin/index.html        # entry админки
├── src/
│   ├── public/             # код публичной страницы
│   ├── admin/              # код админки SPA
│   └── shared/             # общие типы, утилиты, словари
├── data/                   # JSON-источник данных (config, categories, ...)
├── images/                 # фотографии (points/, authors/, ...)
├── locales/                # UI-словари
├── static/                 # favicon, og-image, robots.txt
├── scripts/                # node-скрипты (validate-data, seed, ...)
└── docs/                   # документация
```

## Документация

- [`docs/EDITORS.md`](docs/EDITORS.md) — инструкция для редакторов карты
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — архитектура и принятые решения
- [`docs/ADD-CITY.md`](docs/ADD-CITY.md) — как форкнуть под новый город

## Лицензия

MIT — см. [LICENSE](LICENSE).
