import { signal } from '@preact/signals';
import type { Point } from '@shared/types/index.ts';

export const selectedPoint = signal<Point | null>(null);
