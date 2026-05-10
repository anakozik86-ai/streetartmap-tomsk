/**
 * Реестр lucide-иконок, используемых категориями.
 *
 * Категория хранит имя иконки в kebab-case (как в `categories.json`).
 * Здесь маппим его на IconNode из vanilla `lucide`-пакета — массив
 * элементов вида [tag, attrs], которые мы сериализуем в inline SVG.
 *
 * Формат IconNode стабилен в lucide уже много версий: каждый именованный
 * экспорт — массив дочерних элементов SVG (path/circle/...) без обёртки
 * самого <svg> (она добавляется здесь, при рендере).
 *
 * Если категория получит неизвестную иконку — fallback в `more-horizontal`.
 */
import {
  Box,
  Grid3x3,
  MoreHorizontal,
  Paintbrush,
  ScrollText,
  SprayCan,
  SquareDashed,
  Sticker,
} from 'lucide';

// Один элемент IconNode — кортеж [имя_тега, атрибуты].
// `readonly` потому что lucide возвращает фризнутые массивы.
type SvgChild = readonly [string, Readonly<Record<string, string | number>>];
type IconNode = readonly SvgChild[];

const REGISTRY: Readonly<Record<string, IconNode>> = {
  paintbrush: Paintbrush as unknown as IconNode,
  'spray-can': SprayCan as unknown as IconNode,
  'square-dashed': SquareDashed as unknown as IconNode,
  'scroll-text': ScrollText as unknown as IconNode,
  sticker: Sticker as unknown as IconNode,
  box: Box as unknown as IconNode,
  'grid-3x3': Grid3x3 as unknown as IconNode,
  'more-horizontal': MoreHorizontal as unknown as IconNode,
};

const FALLBACK = REGISTRY['more-horizontal']!;

/** Получить IconNode по имени иконки из категории. */
export function resolveIcon(name: string): IconNode {
  return REGISTRY[name] ?? FALLBACK;
}

/**
 * Сериализовать IconNode в inline SVG-строку.
 * Размер иконки контролируется через CSS (width/height на классе),
 * поэтому атрибуты ширины здесь не задаём — оставляем масштабируемое 24×24.
 */
export function renderIconSvg(icon: IconNode, className: string): string {
  const children = icon.map(serializeChild).join('');
  return (
    `<svg class="${escapeAttr(className)}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" ` +
    `aria-hidden="true" focusable="false">${children}</svg>`
  );
}

function serializeChild([tag, attrs]: SvgChild): string {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(' ');
  return `<${tag} ${a} />`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
