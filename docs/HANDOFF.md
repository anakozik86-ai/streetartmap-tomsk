# streetartmap — передача в новую сессию

> Скопируй этот файл в начало нового чата. После этого приложи последний zip проекта.

## Что за проект

Карта стрит-арта Томска. Бесплатный статический сайт + кастомная админка. Хостинг
GitHub Pages, данные и фото в репо, авторизация редакторов через Personal Access Token.

## Где мы сейчас

- ✅ Этапы 1–4 закрыты (архитектура, модель данных, каркас репо, CI)
- ✅ Этап 5a закрыт (тёмная/светлая тема, базовая карта Leaflet + CartoDB)
- 🟡 **Следующий шаг — этап 5b: маркеры точек на карте**
- ⬜️ Дальше: 5c попап → 5d фильтры → 5e маршруты → 5f полировка → 6 логин админки
  → 7 редактор справочников → 8 редактор точек → 9 редактор маршрутов → 10 полировка

Готово ~24% от общего объёма.

## Правила работы на эту сессию

1. **Минимум планирующего текста.** Архитектура зафиксирована, идём сразу к коду.
   Объяснять «что и почему» — только при реально спорных моментах.
2. **Не разжёвывать установку и терминал.** Команды одним блоком, без скринов «куда
   нажать», предполагать что среда уже работает.
3. **Не спрашивать «согласны?» по каждому решению.** Делать по умолчанию,
   спрашивать только в принципиальных развилках.
4. **Сжатый стиль ответа.** Только код, короткие комментарии, пошаговый список
   действий. Без таблиц сравнений и длинных вводных.

## Стек

Vite + TypeScript + Preact + @preact/signals · Leaflet + CartoDB Voyager/Dark Matter
· OSRM public foot profile · pnpm · GitHub Pages · GitHub Actions для CI · AJV для
валидации JSON-данных в CI.

## Архитектурные решения (зафиксированы)

| #             | Решение                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Админка       | Кастомная Preact SPA, не Decap/Sveltia                                                                              |
| Auth          | GitHub Personal Access Token, без OAuth-прокси                                                                      |
| Фото          | В репо `images/`, отдача через jsDelivr CDN, при загрузке генерируем 3 размера. Слой `storage` для будущей миграции |
| Маршруты      | OSRM public, профиль foot, кэш geometry в `routes.json`, fallback на прямые линии                                   |
| Локализация   | UI в словарях (`locales/ru.json`), контент plain string, миграция на i18n позже                                     |
| Публичность   | Публичный репо, поле `status: draft/published/archived` у точек и маршрутов                                         |
| Категории     | 8 фиксированных: mural, graffiti, stencil, paste-up, sticker, sculpture, mosaic, other. Иконка маркера = категория  |
| Коллекции     | Объединены `festival + series` через `type`. Цвет(а) обводки = коллекции, conic-gradient до 4 видимых сегментов     |
| Утраченные    | По умолчанию скрыты, переключатель «показать» делает их видимыми с пониженной непрозрачностью                       |
| Авторы        | Отдельный справочник `authors.json` (slug-id), не свободная строка                                                  |
| Soft-delete   | `status: active/archived` у справочников + жёсткое удаление при отсутствии ссылок                                   |
| Тема          | Только light/dark (без отдельного system-режима). Дефолт по системе при первом заходе                               |
| Палитра       | Фон `#0E1116`/`#F7F5F0`, акцент кислотно-зелёный `#B8FF3D`. Шрифты: Onest (текст), Unbounded (заголовки/логотип)    |
| Тайлы         | CartoDB Voyager (light) + Dark Matter (dark)                                                                        |
| Логотип       | Wordmark `streetartmap` строчными в Unbounded                                                                       |
| Макет         | Карта на весь экран, плавающие панели поверх (вариант A). Адаптив сразу под десктоп + мобайл                        |
| Целевой экран | MacBook Pro 16" 2560×1664                                                                                           |

## Модель данных (compact)

```
config.json: { schema_version, city: {name, center, default_zoom, bounds},
               site: {title, description, default_locale}, features }
categories.json: [{ id, name, icon, description?, order, status, ...auditable }]
collections.json: [{ id, type:'festival'|'series', name, color, description?,
                     year_start?, year_end?, organizer_or_author?, cover_image?,
                     external_links?, status, ...auditable }]
authors.json: [{ id, name, bio?, photo?, active_years?, origin?,
                 external_links?, status, ...auditable }]
points.json: [{ id, status:'draft'|'published'|'archived',
                coords:{lat,lng}, address_hint?, accessibility,
                category_id, collection_ids:[], tags:[],
                title, description, author_id?, year_created?,
                dimensions?, materials:[],
                state, state_checked_at?,
                photos:[{filename, caption?, credit?, width, height}],
                featured, ...auditable }]
routes.json: [{ id, status, name, description?, point_ids:[],
                geometry:GeoJSON.LineString|null, geometry_hash,
                total_distance_m?, total_duration_s?, cover_image?,
                ...auditable }]
```

`auditable = { created_at, updated_at, created_by, updated_by }` (ISO 8601, GitHub login)

## Структура репо

```
streetartmap-tomsk/
├── index.html              # entry публичной страницы
├── admin/index.html        # entry админки
├── src/
│   ├── public/             # код публичной (App, MapView, ThemeToggle, Logo, hooks, styles)
│   ├── admin/              # код админки (пока stub)
│   └── shared/             # types, utils (loadConfig)
├── data/                   # JSON-источники (config + 5 массивов)
├── images/                 # фото
├── locales/ru.json         # UI-словарь
├── static/                 # favicon и т.п.
├── scripts/validate-data.ts # валидатор для CI
├── docs/                   # README, ARCHITECTURE, EDITORS, ADD-CITY, HANDOFF
├── .github/workflows/      # deploy.yml + validate.yml
└── eslint, prettier, vite, tsconfig
```

## Что лежит в коде уже сейчас

Каркас + этап 5a живые: `src/public/main.tsx → App.tsx`, компоненты `MapView`,
`ThemeToggle` (две кнопки солнце/луна), `Logo`. Кастомная атрибуция Leaflet —
свёрнутый кружок `i`, при наведении раскрывается. CSS токены в `tokens.css`,
тёмная тема через `[data-theme='dark']`. Тема сохраняется в localStorage, FOUC
гасится inline-скриптом в HTML до рендера.

`pnpm validate` чистый, `pnpm dev` запускает на http://localhost:5173/.

## Первое задание в новой сессии

Сделать **этап 5b**: рендеринг маркеров точек на карте.

- Загрузить `points.json`, `categories.json`, `collections.json` (паттерн как в
  `loadConfig`).
- Маркеры — inline SVG: круг-фон + lucide-иконка категории в центре + кольцо-обводка.
  Если коллекций > 1 — conic-gradient по цветам коллекций (порядок: year_start,
  затем алфавитный). Лимит 4 видимых сегмента, остальное в попапе позже.
- Состояния маркера: `intact` норм, `damaged` маленький треугольник-предупреждение,
  `painted_over`/`removed` opacity 0.45 + прерывистая обводка (отображаются только
  если включён переключатель утраченных — пока не делаем, оставим скрытыми).
- Hover: scale 1.15 пружинистая кривая, 200мс. Active (попап открыт): scale 1.2 +
  glow.
- Положить в `data/points.json` 5 тестовых точек по центру Томска (5 разных
  категорий, 1–2 с принадлежностью к выдуманной коллекции, чтобы было видно
  обводки и градиент). 1–2 коллекции в `collections.json`.

Поведение клика по маркеру в 5b ещё **не делаем** — это 5c. На 5b — только
рендеринг и hover-анимация.
