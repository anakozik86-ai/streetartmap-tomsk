# DATA MODEL — streetartmap-tomsk

Источник правды: `src/shared/types/data.ts`.
JSON-схемы (AJV) в `scripts/validate-data.ts` поддерживаются в соответствии.

При изменении shape сущности: правка `data.ts` → правка AJV-схемы → правка тестовых данных в `data/`. Не наоборот.

## Общие типы

```ts
interface Auditable {
  created_at: string; // ISO 8601 UTC
  updated_at: string;
  created_by: string; // GitHub login
  updated_by: string;
}

type EntityStatus = 'active' | 'archived'; // у справочников всегда 'active'; тип оставлен для совместимости
type ContentStatus = 'published' | 'archived'; // точки, маршруты

interface ExternalLink {
  label: string;
  url: string;
}
```

Дефолтный статус новой точки/маршрута — `'archived'`. Логика: «создал → доделал → toggle на `published`».

## config.json — SiteConfig

```ts
{
  schema_version: number,
  city: {
    name: string,
    name_en?: string,
    center: { lat: number, lng: number },
    default_zoom: number,
    bounds?: { sw: {lat,lng}, ne: {lat,lng} }
  },
  site: { title: string, description: string, default_locale: 'ru' },
  features: {
    show_lost_works_default: boolean,
    max_visible_collection_colors: number   // сколько секторов в conic-gradient
  }
}
```

## categories.json — Category[]

```ts
{
  id: string,          // slug: mural | graffiti | mosaic | other
  name: string,
  icon: string,        // имя иконки lucide kebab-case
  description?: string,
  order: number,
  status: EntityStatus, // в JSON всегда 'active'
  ...Auditable
}
```

С 11e категорий 4. Удалены `stencil`, `paste-up`, `sticker`, `sculpture` как неиспользуемые. См. ARCHITECTURE.md пункт 7.

## collections.json — Collection[]

```ts
{
  id: string,
  type: 'festival' | 'series',
  name: string,
  color: string,       // hex, например "#FF6B1A" — цвет обводки маркера
  description?: string,
  year_start?: number,
  year_end?: number,   // отсутствует = ongoing
  organizer_or_author?: string,
  cover_image?: string,
  external_links?: ExternalLink[],
  status: EntityStatus, // в JSON всегда 'active'
  ...Auditable
}
```

## authors.json — Author[]

```ts
{
  id: string,
  name: string,
  bio?: string,        // markdown
  photo?: string,      // filename в images/authors/
  active_years?: { start?: number, end?: number },
  origin?: string,
  external_links?: ExternalLink[],
  status: EntityStatus, // в JSON всегда 'active'
  ...Auditable
}
```

## points.json — Point[]

```ts
{
  id: string,
  status: ContentStatus,   // 'published' | 'archived'
  coords: { lat: number, lng: number },
  address_hint?: string,
  accessibility: 'street' | 'courtyard' | 'interior' | 'restricted' | 'unknown',

  category_id: string,       // ссылка на categories[].id
  collection_ids: string[],  // ссылки на collections[].id
  tags: string[],

  title: string,
  description: string,       // markdown
  author_ids: string[],      // ссылки на authors[].id; пустой массив = автор(ы) не указан(ы); порядок = порядок отображения
  year_created?: number,
  dimensions?: string,
  materials: string[],

  state: 'intact' | 'damaged' | 'restored' | 'painted_over' | 'removed' | 'unknown',
  state_checked_at?: string, // ISO 8601

  photos: Array<{
    filename: string,
    caption?: string,
    credit?: string,
    width: number,   // натуральные размеры для предотвращения CLS
    height: number
  }>,

  featured: boolean,
  ...Auditable
}
```

**Важно:** `state=painted_over|removed` → точка «утраченная» (`isLost()`), скрыта по умолчанию.

## routes.json — Route[]

```ts
{
  id: string,
  status: ContentStatus,   // 'published' | 'archived'
  name: string,
  description?: string,
  point_ids: string[],   // упорядоченный список

  /** Leaflet-формат [lat, lng] (не GeoJSON [lng, lat]). */
  via_waypoints?: [number, number][],

  geometry: { type: 'LineString', coordinates: [lng, lat][] } | null,
  geometry_hash: string, // sha256 от point_ids + coords + via_waypoints
  total_distance_m?: number,
  total_duration_s?: number,

  cover_image?: string,
  ...Auditable
}
```

Формула `geometry_hash`: `ANCHORS:{id}:{lat6},{lng6}|...|VIA:{lat6},{lng6}|...` через `sha256`. Синхронизирована между:

- `scripts/validate-data.ts` → `geometryHashFor()`
- `src/admin/components/routing/geometryHash.ts` → `computeGeometryHash()`

## Текущие данные (после 11e)

### categories.json (4)

| id       | name     | icon            | order |
| -------- | -------- | --------------- | ----- |
| mural    | Мурал    | brush           | 1     |
| graffiti | Граффити | spray-can       | 2     |
| mosaic   | Мозаика  | grid-3x3        | 3     |
| other    | Другое   | more-horizontal | 4     |

### collections.json (4)

| id                 | type     | name                  | color   |
| ------------------ | -------- | --------------------- | ------- |
| street-vision-2021 | festival | Выход в город 2021    | #FFD93D |
| street-vision-2023 | festival | Выход в город 2023    | #E63946 |
| muka-warehouses    | series   | мУкА.Склады искусства | #9B5DE5 |
| sibiriada          | series   | Сибириада             | #06A77D |

### authors.json (19)

См. полный список в HANDOFF.md этапа 11e. Ключевые: Илья Wince Маломощенко (8 работ), Матвей Фатеев и Марина Зайкова (по 3), остальные по 1-2.

### points.json (22)

22 реальные работы по городу: 14 муралов, 4 граффити, 2 мозаики, 2 ассамбляжа. Все `status: 'published'`, `state: 'intact'`. Полная сводка с координатами и привязками — в HANDOFF.md этапа 11e.

### routes.json

Пусто. Маршруты будут собираться в админке после заливки точек.
