#!/usr/bin/env tsx
/**
 * Валидация всех data/*.json файлов перед деплоем.
 *
 * Что проверяется:
 *  1. Структура: обязательные поля, типы, форматы (через AJV + JSON Schema).
 *  2. Уникальность ID внутри каждой сущности.
 *  3. Корректность slug'ов (kebab-case, латиница/цифры/дефисы).
 *  4. Кросс-ссылки: category_id, author_ids[], collection_ids, point_ids — все
 *     указывают на существующие неархивированные записи.
 *  5. Состояние маршрутов: geometry_hash совпадает с пересчитанным
 *     (несовпадение — warning, не ошибка).
 *
 * Выходит с кодом 0 если всё ок, 1 если есть errors. Warnings не блокируют.
 *
 * Запуск: pnpm validate:data
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

import type {
  SiteConfig,
  Category,
  Collection,
  Author,
  Point,
  Route,
  RouteViaWaypoint,
} from '../src/shared/types/index.ts';

// ----- настройка -----

const DATA_DIR = resolve(process.cwd(), 'data');
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// ----- сбор ошибок -----

const errors: string[] = [];
const warnings: string[] = [];

function err(file: string, message: string): void {
  errors.push(`[${file}] ${message}`);
}

function warn(file: string, message: string): void {
  warnings.push(`[${file}] ${message}`);
}

function readJson<T>(filename: string): T | null {
  const path = resolve(DATA_DIR, filename);
  if (!existsSync(path)) {
    err(filename, `файл не найден: ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (e) {
    err(filename, `невалидный JSON: ${(e as Error).message}`);
    return null;
  }
}

function formatAjvErrors(file: string, ajvErrors: ErrorObject[] | null): void {
  if (!ajvErrors) return;
  for (const e of ajvErrors) {
    err(file, `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
  }
}

// ----- JSON-схемы -----

const auditable = {
  type: 'object',
  required: ['created_at', 'updated_at', 'created_by', 'updated_by'],
  properties: {
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    created_by: { type: 'string', minLength: 1 },
    updated_by: { type: 'string', minLength: 1 },
  },
} as const;

const slugSchema = { type: 'string', pattern: SLUG_RE.source } as const;

const externalLinkSchema = {
  type: 'object',
  required: ['label', 'url'],
  additionalProperties: false,
  properties: {
    label: { type: 'string', minLength: 1 },
    url: { type: 'string', format: 'uri' },
  },
} as const;

const configSchema = {
  type: 'object',
  required: ['schema_version', 'city', 'site', 'features'],
  properties: {
    schema_version: { type: 'integer', minimum: 1 },
    city: {
      type: 'object',
      required: ['name', 'center', 'default_zoom'],
      properties: {
        name: { type: 'string', minLength: 1 },
        name_en: { type: 'string' },
        center: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
          },
        },
        default_zoom: { type: 'integer', minimum: 1, maximum: 20 },
        bounds: { type: 'object' },
      },
    },
    site: {
      type: 'object',
      required: ['title', 'description', 'default_locale'],
      properties: {
        title: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        default_locale: { const: 'ru' },
      },
    },
    features: {
      type: 'object',
      required: ['show_lost_works_default', 'max_visible_collection_colors'],
      properties: {
        show_lost_works_default: { type: 'boolean' },
        max_visible_collection_colors: { type: 'integer', minimum: 1, maximum: 8 },
      },
    },
  },
} as const;

const categorySchema = {
  allOf: [
    auditable,
    {
      type: 'object',
      required: ['id', 'name', 'icon', 'order', 'status'],
      properties: {
        id: slugSchema,
        name: { type: 'string', minLength: 1 },
        icon: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        order: { type: 'integer', minimum: 1 },
        status: { enum: ['active', 'archived'] },
      },
    },
  ],
} as const;

const collectionSchema = {
  allOf: [
    auditable,
    {
      type: 'object',
      required: ['id', 'type', 'name', 'color', 'status'],
      properties: {
        id: slugSchema,
        type: { enum: ['festival', 'series'] },
        name: { type: 'string', minLength: 1 },
        color: { type: 'string', pattern: HEX_COLOR_RE.source },
        description: { type: 'string' },
        year_start: { type: 'integer' },
        year_end: { type: 'integer' },
        organizer_or_author: { type: 'string' },
        cover_image: { type: 'string' },
        external_links: { type: 'array', items: externalLinkSchema },
        status: { enum: ['active', 'archived'] },
      },
    },
  ],
} as const;

const authorSchema = {
  allOf: [
    auditable,
    {
      type: 'object',
      required: ['id', 'name', 'status'],
      properties: {
        id: slugSchema,
        name: { type: 'string', minLength: 1 },
        bio: { type: 'string' },
        photo: { type: 'string' },
        active_years: { type: 'object' },
        origin: { type: 'string' },
        external_links: { type: 'array', items: externalLinkSchema },
        status: { enum: ['active', 'archived'] },
      },
    },
  ],
} as const;

const pointSchema = {
  allOf: [
    auditable,
    {
      type: 'object',
      required: [
        'id',
        'status',
        'coords',
        'accessibility',
        'category_id',
        'collection_ids',
        'tags',
        'title',
        'description',
        'author_ids',
        'materials',
        'state',
        'photos',
        'featured',
      ],
      properties: {
        id: slugSchema,
        status: { enum: ['published', 'archived'] },
        coords: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
          },
        },
        address_hint: { type: 'string' },
        accessibility: { enum: ['street', 'courtyard', 'interior', 'restricted', 'unknown'] },
        category_id: slugSchema,
        collection_ids: { type: 'array', items: slugSchema },
        tags: { type: 'array', items: { type: 'string' } },
        title: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        author_ids: { type: 'array', items: slugSchema },
        year_created: { type: 'integer' },
        dimensions: { type: 'string' },
        materials: { type: 'array', items: { type: 'string' } },
        state: { enum: ['intact', 'damaged', 'restored', 'painted_over', 'removed', 'unknown'] },
        state_checked_at: { type: 'string', format: 'date-time' },
        photos: {
          type: 'array',
          items: {
            type: 'object',
            required: ['filename', 'width', 'height'],
            properties: {
              filename: { type: 'string', minLength: 1 },
              caption: { type: 'string' },
              credit: { type: 'string' },
              width: { type: 'integer', minimum: 1 },
              height: { type: 'integer', minimum: 1 },
            },
          },
        },
        featured: { type: 'boolean' },
      },
    },
  ],
} as const;

const routeSchema = {
  allOf: [
    auditable,
    {
      type: 'object',
      required: ['id', 'status', 'name', 'point_ids', 'geometry', 'geometry_hash'],
      properties: {
        id: slugSchema,
        status: { enum: ['published', 'archived'] },
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        point_ids: { type: 'array', items: slugSchema, minItems: 2 },
        // via_waypoints: drag-точки коррекции линии с привязкой к индексу anchor'а.
        // `after` ∈ [0, point_ids.length - 2] — индекс anchor'а, после которого вставлять.
        // lat/lng — Leaflet-формат (не GeoJSON).
        via_waypoints: {
          type: 'array',
          items: {
            type: 'object',
            required: ['after', 'lat', 'lng'],
            additionalProperties: false,
            properties: {
              after: { type: 'integer', minimum: 0 },
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
            },
          },
        },
        geometry: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              required: ['type', 'coordinates'],
              properties: {
                type: { const: 'LineString' },
                coordinates: {
                  type: 'array',
                  items: {
                    type: 'array',
                    items: { type: 'number' },
                    minItems: 2,
                    maxItems: 2,
                  },
                },
              },
            },
          ],
        },
        geometry_hash: { type: 'string', minLength: 1 },
        total_distance_m: { type: 'number', minimum: 0 },
        total_duration_s: { type: 'number', minimum: 0 },
        cover_image: { type: 'string' },
        color: { type: 'string', pattern: HEX_COLOR_RE.source },
      },
    },
  ],
} as const;

// ----- хелперы -----

function checkUnique<T extends { id: string }>(file: string, items: T[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) err(file, `дубль id: "${item.id}"`);
    seen.add(item.id);
  }
}

/**
 * Вычисляет geometry_hash для маршрута.
 *
 * Формула ДОЛЖНА совпадать с src/admin/components/routing/geometryHash.ts.
 * Изменение здесь требует синхронной правки там.
 *
 * Формат: ANCHORS:{id1}:{lat6},{lng6}|{id2}:{lat6},{lng6}|VIA:{after}@{vlat6},{vlng6}|...
 * via_waypoints — RouteViaWaypoint с полем `after` (индекс anchor'а).
 *
 * Defensive: невалидные элементы via (например, старый формат [lat,lng]
 * или null) отбрасываются — нужно чтобы validate-data не крашился TypeError'ом
 * на старых данных в data/routes.json. Параллельно AJV-валидация выдаст ошибку
 * на этот же массив, и пользователь увидит конкретную причину.
 */
export function geometryHashFor(
  pointIds: string[],
  coords: Map<string, { lat: number; lng: number }>,
  viaWaypoints: RouteViaWaypoint[] | undefined,
): string {
  const anchorsStr = pointIds
    .map((id) => {
      const c = coords.get(id);
      return c ? `${id}:${c.lat.toFixed(6)},${c.lng.toFixed(6)}` : `${id}:?`;
    })
    .join('|');

  const viaStr = (viaWaypoints ?? [])
    .filter(
      (v): v is RouteViaWaypoint =>
        v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        typeof (v as RouteViaWaypoint).after === 'number' &&
        typeof (v as RouteViaWaypoint).lat === 'number' &&
        typeof (v as RouteViaWaypoint).lng === 'number',
    )
    .map((v) => `${v.after}@${v.lat.toFixed(6)},${v.lng.toFixed(6)}`)
    .join('|');

  const payload = `ANCHORS:${anchorsStr}|VIA:${viaStr}`;
  return createHash('sha256').update(payload).digest('hex');
}

// ----- проверка -----

function main(): void {
  const config = readJson<SiteConfig>('config.json');
  if (config) {
    const valid = ajv.validate(configSchema, config);
    if (!valid) formatAjvErrors('config.json', ajv.errors ?? null);
  }

  const categories = readJson<Category[]>('categories.json') ?? [];
  const collections = readJson<Collection[]>('collections.json') ?? [];
  const authors = readJson<Author[]>('authors.json') ?? [];
  const points = readJson<Point[]>('points.json') ?? [];
  const routes = readJson<Route[]>('routes.json') ?? [];

  for (const c of categories) {
    if (!ajv.validate(categorySchema, c))
      formatAjvErrors(`categories.json[id=${c.id ?? '?'}]`, ajv.errors ?? null);
  }
  for (const c of collections) {
    if (!ajv.validate(collectionSchema, c))
      formatAjvErrors(`collections.json[id=${c.id ?? '?'}]`, ajv.errors ?? null);
  }
  for (const a of authors) {
    if (!ajv.validate(authorSchema, a))
      formatAjvErrors(`authors.json[id=${a.id ?? '?'}]`, ajv.errors ?? null);
  }
  for (const p of points) {
    if (!ajv.validate(pointSchema, p))
      formatAjvErrors(`points.json[id=${p.id ?? '?'}]`, ajv.errors ?? null);
  }
  for (const r of routes) {
    if (!ajv.validate(routeSchema, r))
      formatAjvErrors(`routes.json[id=${r.id ?? '?'}]`, ajv.errors ?? null);
  }

  checkUnique('categories.json', categories);
  checkUnique('collections.json', collections);
  checkUnique('authors.json', authors);
  checkUnique('points.json', points);
  checkUnique('routes.json', routes);

  const activeCategories = new Set(
    categories.filter((c) => c.status === 'active').map((c) => c.id),
  );
  const activeCollections = new Set(
    collections.filter((c) => c.status === 'active').map((c) => c.id),
  );
  const activeAuthors = new Set(authors.filter((a) => a.status === 'active').map((a) => a.id));
  const pointCoords = new Map<string, { lat: number; lng: number }>();
  for (const p of points) pointCoords.set(p.id, p.coords);
  const allPointIds = new Set(points.map((p) => p.id));

  for (const p of points) {
    if (p.status === 'archived') continue;
    if (!activeCategories.has(p.category_id))
      err(
        `points.json[id=${p.id}]`,
        `category_id "${p.category_id}" не существует или архивирована`,
      );
    for (const cid of p.collection_ids) {
      if (!activeCollections.has(cid))
        err(`points.json[id=${p.id}]`, `collection_id "${cid}" не существует или архивирована`);
    }
    // Проверяем дубли author_ids внутри одной точки.
    // ?? [] — defensive: если AJV-валидация уже зафейлила author_ids,
    // не падаем TypeError'ом, а даём AJV-сообщению дойти до пользователя.
    const seenAuthors = new Set<string>();
    for (const aid of p.author_ids ?? []) {
      if (seenAuthors.has(aid))
        err(`points.json[id=${p.id}]`, `author_id "${aid}" указан несколько раз`);
      seenAuthors.add(aid);
      if (!activeAuthors.has(aid))
        err(`points.json[id=${p.id}]`, `author_id "${aid}" не существует или архивирован`);
    }
  }

  for (const r of routes) {
    if (r.status === 'archived') continue;
    for (const pid of r.point_ids) {
      if (!allPointIds.has(pid)) err(`routes.json[id=${r.id}]`, `point_id "${pid}" не существует`);
    }
    if (r.point_ids.every((pid) => pointCoords.has(pid))) {
      const expected = geometryHashFor(r.point_ids, pointCoords, r.via_waypoints);
      if (expected !== r.geometry_hash) {
        warn(
          `routes.json[id=${r.id}]`,
          `geometry_hash устарел — точки сместились, via_waypoints изменились или порядок изменён; требуется пересборка маршрута`,
        );
      }
    }
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Warnings:');
    for (const w of warnings) console.warn(`  ${w}`);
  }

  if (errors.length > 0) {
    console.error('\n❌ Errors:');
    for (const e of errors) console.error(`  ${e}`);
    console.error(`\n${errors.length} ошибок, ${warnings.length} предупреждений`);
    process.exit(1);
  }

  console.log(
    `✅ Валидация пройдена: ${categories.length} категорий, ${collections.length} коллекций, ` +
      `${authors.length} авторов, ${points.length} точек, ${routes.length} маршрутов` +
      (warnings.length > 0 ? ` (${warnings.length} предупреждений)` : ''),
  );
}

// Запускаем main() только если файл вызван напрямую (tsx scripts/validate-data.ts),
// а не при импорте из других скриптов (например scripts/seed-routes.ts).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
