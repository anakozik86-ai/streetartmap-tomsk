/**
 * TypeScript-типы для всех сущностей данных streetartmap.
 *
 * Источник правды: эти типы. JSON-схемы (для рантайм-валидации в
 * scripts/validate-data.ts) генерируются/поддерживаются в соответствии.
 *
 * См. docs/EDITORS.md для пояснений по семантике полей.
 */

// ----- общее -----

export interface Auditable {
  created_at: string; // ISO 8601 UTC
  updated_at: string; // ISO 8601 UTC
  created_by: string; // GitHub login
  updated_by: string; // GitHub login
}

export type EntityStatus = 'active' | 'archived';
export type ContentStatus = 'draft' | 'published' | 'archived';

export interface ExternalLink {
  label: string;
  url: string;
}

// ----- категории -----

export interface Category extends Auditable {
  id: string;
  name: string;
  icon: string; // имя иконки lucide
  description?: string;
  order: number;
  status: EntityStatus;
}

// ----- коллекции (фестивали + серии) -----

export type CollectionType = 'festival' | 'series';

export interface Collection extends Auditable {
  id: string;
  type: CollectionType;
  name: string;
  color: string; // hex, e.g. "#FF6B1A"
  description?: string; // markdown
  year_start?: number;
  year_end?: number; // отсутствует = ongoing
  organizer_or_author?: string;
  cover_image?: string; // filename внутри images/collections/
  external_links?: ExternalLink[];
  status: EntityStatus;
}

// ----- авторы -----

export interface Author extends Auditable {
  id: string;
  name: string;
  bio?: string; // markdown
  photo?: string; // filename внутри images/authors/
  active_years?: { start?: number; end?: number };
  origin?: string;
  external_links?: ExternalLink[];
  status: EntityStatus;
}

// ----- точки -----

export type PointAccessibility =
  | 'street'
  | 'courtyard'
  | 'interior'
  | 'restricted'
  | 'unknown';

export type PointState =
  | 'intact'
  | 'damaged'
  | 'restored'
  | 'painted_over'
  | 'removed'
  | 'unknown';

export interface PointPhoto {
  filename: string; // "2025-01-15-front.webp" — базовое имя
  caption?: string;
  credit?: string;
  width: number; // натуральные размеры оригинала, для предотвращения CLS
  height: number;
}

export interface Point extends Auditable {
  id: string;
  status: ContentStatus;

  // локация
  coords: { lat: number; lng: number };
  address_hint?: string;
  accessibility: PointAccessibility;

  // классификация
  category_id: string;
  collection_ids: string[];
  tags: string[];

  // содержание
  title: string;
  description: string; // markdown
  author_id?: string;
  year_created?: number;
  dimensions?: string;
  materials: string[];

  // состояние
  state: PointState;
  state_checked_at?: string; // ISO 8601

  // медиа
  photos: PointPhoto[];

  // редакторская выборка
  featured: boolean;
}

// ----- маршруты -----

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat] по GeoJSON-конвенции
}

export interface Route extends Auditable {
  id: string;
  status: ContentStatus;
  name: string;
  description?: string; // markdown
  point_ids: string[]; // упорядоченный список

  // кэш геометрии из OSRM
  geometry: RouteGeometry | null; // null = OSRM не ответил, рендерим прямые
  geometry_hash: string; // sha256 от point_ids + их coords
  total_distance_m?: number;
  total_duration_s?: number;

  cover_image?: string; // filename внутри images/routes/
}

// ----- глобальный конфиг -----

export interface SiteConfig {
  schema_version: number;
  city: {
    name: string;
    name_en?: string;
    center: { lat: number; lng: number };
    default_zoom: number;
    bounds?: {
      sw: { lat: number; lng: number };
      ne: { lat: number; lng: number };
    };
  };
  site: {
    title: string;
    description: string;
    default_locale: 'ru';
  };
  features: {
    show_lost_works_default: boolean;
    max_visible_collection_colors: number;
  };
}
