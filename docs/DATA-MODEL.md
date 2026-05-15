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
  id: string,          // slug: mural | graffiti | stencil | paste-up | sticker | sculpture | mosaic | other
  name: string,
  icon: string,        // имя иконки lucide kebab-case
  description?: string,
  order: number,
  status: EntityStatus, // в JSON всегда 'active'
  ...Auditable
}
```

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
  author_id?: string,        // ссылка на authors[].id
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

## Текущие тестовые данные (dev)

### authors.json

3 тестовых автора, все `status: active`:

| id              | name              | origin      |
| --------------- | ----------------- | ----------- |
| ivan-petrov     | Иван Петров       | Томск       |
| anna-volkov     | Анна Волкова      | Новосибирск |
| kollektiv-forma | Коллектив «Форма» | Томск       |

### collections.json

| id                 | type     | color   |
| ------------------ | -------- | ------- |
| tomsk-portraits    | series   | #4DB8FF |
| street-vision-2023 | festival | #FF6B1A |

### points.json (5 точек)

| id                         | category  | state   | status    | author          | collections                          |
| -------------------------- | --------- | ------- | --------- | --------------- | ------------------------------------ |
| lenina-mural-1             | mural     | intact  | published | ivan-petrov     | street-vision-2023                   |
| tsu-graffiti-1             | graffiti  | intact  | published | anna-volkov     | tomsk-portraits + street-vision-2023 |
| lagernyy-stencil-1         | stencil   | damaged | published | kollektiv-forma | —                                    |
| voskresenskaya-sculpture-1 | sculpture | intact  | published | ivan-petrov     | tomsk-portraits                      |
| novosobornaya-paste-1      | paste-up  | intact  | published | kollektiv-forma | —                                    |

Все точки: `photos: []`.

### routes.json (2 маршрута)

| id                | status    | points                      |
| ----------------- | --------- | --------------------------- |
| tomsk-center-walk | published | несколько центральных точек |
| tomsk-south-walk  | published | несколько южных точек       |
