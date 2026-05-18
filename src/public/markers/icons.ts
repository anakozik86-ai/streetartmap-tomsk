/**
 * Реестр lucide-иконок, используемых категориями.
 *
 * Формат экспорта lucide ^0.468: ["svg", rootAttrs, [["tag", attrs, children?], ...]]
 * Рендерер обходит дерево рекурсивно.
 *
 * Если категория получит неизвестную иконку — fallback в `more-horizontal`.
 */
import {
  Box,
  Grid3x3,
  MoreHorizontal,
  Paintbrush,
  Palette,
  ScrollText,
  SprayCan,
  SquareDashed,
  Sticker,
} from 'lucide';

type Attrs = Readonly<Record<string, string | number>>;
// Узел modern-формата: [tag, attrs, children?]
type IconNode = readonly [string, Attrs, ReadonlyArray<IconNode> | undefined];

const REGISTRY: Readonly<Record<string, unknown>> = {
  paintbrush: Paintbrush,
  'spray-can': SprayCan,
  'square-dashed': SquareDashed,
  'scroll-text': ScrollText,
  sticker: Sticker,
  box: Box,
  'grid-3x3': Grid3x3,
  palette: Palette,
  'more-horizontal': MoreHorizontal,
};

const FALLBACK = MoreHorizontal as unknown as IconNode;

export function resolveIcon(name: string): IconNode {
  return (REGISTRY[name] as IconNode | undefined) ?? FALLBACK;
}

export function renderIconSvg(icon: IconNode, className: string): string {
  const [, rootAttrs, children] = icon;
  const safeChildren = children ?? [];
  const attrs = serializeAttrs({
    ...rootAttrs,
    class: className,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const inner = safeChildren.map(renderNode).join('');
  return `<svg ${attrs}>${inner}</svg>`;
}

function renderNode(node: IconNode): string {
  const [tag, attrs, children] = node;
  const a = serializeAttrs(attrs);
  if (!children || children.length === 0) return `<${tag} ${a}/>`;
  return `<${tag} ${a}>${children.map(renderNode).join('')}</${tag}>`;
}

function serializeAttrs(attrs: Record<string, string | number>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(' ');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
