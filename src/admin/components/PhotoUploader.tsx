import type { JSX } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { Point } from '@shared/types/data.ts';
import { repoOwner, repoName } from '../state/repoMeta.ts';
import { pat } from '../state/auth.ts';
import { putBinaryFile, getFileSha } from '../github/contents.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

type PointPhoto = Point['photos'][number];

interface PhotoItem extends PointPhoto {
  /** Temporary object URL for preview (only for newly added files, cleared on unmount). */
  previewUrl?: string;
  uploading?: boolean;
  error?: string;
}

interface Props {
  pointId: string;
  photos: PointPhoto[];
  onChange: (next: PointPhoto[]) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIZES = [
  { suffix: 'full', maxPx: 1600, quality: 0.9 },
  { suffix: 'medium', maxPx: 800, quality: 0.88 },
  { suffix: 'thumb', maxPx: 200, quality: 0.85 },
] as const;

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

// ── Canvas resize helper ──────────────────────────────────────────────────────

async function resizeToBlob(
  source: HTMLImageElement,
  maxPx: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const { naturalWidth: sw, naturalHeight: sh } = source;
  const scale = Math.min(1, maxPx / Math.max(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, dw, dh);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve({ blob, width: dw, height: dh });
        else reject(new Error('canvas.toBlob failed'));
      },
      'image/jpeg',
      quality,
    );
  });
}

function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = objectUrl;
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]!);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Upload logic ──────────────────────────────────────────────────────────────

/** Returns the base filename (without suffix/ext), e.g. "my-photo-1" */
function makeBaseName(pointId: string, index: number): string {
  return `${pointId}-${String(index + 1).padStart(2, '0')}`;
}

/** Path in repo: images/{pointId}/{base}-{suffix}.jpg */
function repoPath(pointId: string, base: string, suffix: string): string {
  return `images/${pointId}/${base}-${suffix}.jpg`;
}

interface UploadResult {
  filename: string; // base filename stored in PointPhoto
  width: number;
  height: number;
}

async function uploadPhoto(
  file: File,
  pointId: string,
  index: number,
  token: string,
  owner: string,
  repo: string,
): Promise<UploadResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const base = makeBaseName(pointId, index);

    // Generate all three sizes sequentially to avoid 409 (parallel PUTs race on SHA)
    let fullWidth = 0;
    let fullHeight = 0;
    for (const { suffix, maxPx, quality } of SIZES) {
      const { blob, width, height } = await resizeToBlob(img, maxPx, quality);
      if (suffix === 'full') {
        fullWidth = width;
        fullHeight = height;
      }
      const b64 = await blobToBase64(blob);
      const path = repoPath(pointId, base, suffix);
      const sha = await getFileSha(owner, repo, path, token);
      await putBinaryFile(owner, repo, path, b64, sha, token, `upload photo ${base}-${suffix}`);
    }

    return { filename: base, width: fullWidth, height: fullHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PhotoUploader({ pointId, photos, onChange }: Props): JSX.Element {
  const [items, setItems] = useState<PhotoItem[]>(() => photos.map((p) => ({ ...p })));
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const didMount = useRef(false);
  // Защёлка «идёт загрузка» — синхронная, чтобы достоверно блокировать повторный
  // сброс файлов до завершения текущего батча (см. processFiles).
  const busyRef = useRef(false);
  // Зеркало items для cleanup на размонтировании (эффект с [] видит только items
  // на момент монтирования, а нам нужны актуальные blob-URL).
  const itemsRef = useRef<PhotoItem[]>(items);
  itemsRef.current = items;
  const owner = repoOwner.value;
  const repo = repoName.value;

  // Sync parent only after mount (skip initial render to avoid wiping existing photos)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const committed = items
      .filter((i) => !i.uploading && !i.error && i.width > 0)
      .map(({ previewUrl: _p, uploading: _u, error: _e, ...photo }) => photo);
    onChange(committed);
  }, [items]);

  // На размонтировании освобождаем все blob-URL превью — иначе утечка памяти.
  useEffect(
    () => () => {
      for (const it of itemsRef.current) {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      }
    },
    [],
  );

  function syncParent(next: PhotoItem[]): void {
    setItems(next);
  }

  async function processFiles(files: FileList | File[]): Promise<void> {
    const arr = Array.from(files);
    if (!arr.length) return;
    // Один батч за раз: пока идёт загрузка, повторный сброс игнорируем — иначе
    // startIndex и имена файлов нового батча столкнутся с текущим и затрут фото.
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // Build placeholder items immediately for UI feedback
      const startIndex = items.length;
      const placeholders: PhotoItem[] = arr.map((file, i) => ({
        filename: makeBaseName(pointId, startIndex + i),
        width: 0,
        height: 0,
        previewUrl: URL.createObjectURL(file),
        uploading: true,
      }));

      const withPlaceholders = [...items, ...placeholders];
      setItems(withPlaceholders);

      // Upload each file; update its placeholder on completion
      await Promise.all(
        arr.map(async (file, i) => {
          const idx = startIndex + i;
          try {
            const result = await uploadPhoto(file, pointId, idx, pat.value, owner, repo);
            setItems((prev) => {
              const next = [...prev];
              const placeholder = next[idx];
              if (placeholder) {
                if (placeholder.previewUrl) URL.revokeObjectURL(placeholder.previewUrl);
                next[idx] = {
                  filename: result.filename,
                  width: result.width,
                  height: result.height,
                  caption: '',
                  credit: '',
                };
              }
              return next;
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
            setItems((prev) => {
              const next = [...prev];
              const placeholder = next[idx];
              if (placeholder) next[idx] = { ...placeholder, uploading: false, error: msg };
              return next;
            });
          }
        }),
      );
    } finally {
      busyRef.current = false;
    }
  }

  function handleFileInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files) void processFiles(input.files);
    input.value = '';
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files) void processFiles(e.dataTransfer.files);
  }

  function removeItem(index: number): void {
    const next = items.filter((_, i) => i !== index);
    // Revoke blob URL if present
    const removed = items[index];
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    syncParent(next);
  }

  function updateCaption(index: number, caption: string): void {
    const next = items.map((item, i) => (i === index ? { ...item, caption } : item));
    syncParent(next);
  }

  function updateCredit(index: number, credit: string): void {
    const next = items.map((item, i) => (i === index ? { ...item, credit } : item));
    syncParent(next);
  }

  function moveUp(index: number): void {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    syncParent(next);
  }

  function moveDown(index: number): void {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
    syncParent(next);
  }

  const cdnBase = `https://cdn.jsdelivr.net/gh/${repoOwner.value}/${repoName.value}@main`;

  function thumbUrl(item: PhotoItem): string {
    if (item.previewUrl) return item.previewUrl;
    return `${cdnBase}/images/${pointId}/${item.filename}-thumb.jpg`;
  }

  const anyUploading = items.some((i) => i.uploading);

  return (
    <div class="photo-uploader">
      {/* Drop zone */}
      <div
        class={`photo-uploader__dropzone${dragOver ? ' photo-uploader__dropzone--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        aria-label="Загрузить фотографии"
      >
        <span class="photo-uploader__dropzone-icon">🖼</span>
        <span class="photo-uploader__dropzone-text">
          Перетащите фото сюда или нажмите для выбора
        </span>
        <span class="photo-uploader__dropzone-hint">
          JPEG, PNG, WebP · до 3 размеров автоматически
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          class="photo-uploader__file-input"
          onChange={handleFileInput}
        />
      </div>

      {/* Photo list */}
      {items.length > 0 && (
        <ul class="photo-uploader__list">
          {items.map((item, i) => (
            <li
              key={item.filename + i}
              class={`photo-uploader__item${item.error ? ' photo-uploader__item--error' : ''}`}
            >
              <div class="photo-uploader__thumb-wrap">
                {item.uploading ? (
                  <div class="photo-uploader__thumb-placeholder">
                    <span class="photo-uploader__spinner" />
                  </div>
                ) : (
                  <img
                    class="photo-uploader__thumb"
                    src={thumbUrl(item)}
                    alt={item.caption ?? item.filename}
                    loading="lazy"
                    width="80"
                    height="80"
                  />
                )}
              </div>

              <div class="photo-uploader__meta">
                {item.error ? (
                  <span class="photo-uploader__error-msg">{item.error}</span>
                ) : item.uploading ? (
                  <span class="photo-uploader__uploading-msg">Загрузка…</span>
                ) : (
                  <>
                    <input
                      class="photo-uploader__caption"
                      type="text"
                      placeholder="Подпись"
                      value={item.caption ?? ''}
                      onInput={(e) => updateCaption(i, (e.target as HTMLInputElement).value)}
                    />
                    <input
                      class="photo-uploader__credit"
                      type="text"
                      placeholder="Автор фото"
                      value={item.credit ?? ''}
                      onInput={(e) => updateCredit(i, (e.target as HTMLInputElement).value)}
                    />
                    <span class="photo-uploader__dims">
                      {item.width}×{item.height}
                    </span>
                  </>
                )}
              </div>

              <div class="photo-uploader__actions">
                <button
                  type="button"
                  class="photo-uploader__btn"
                  onClick={() => moveUp(i)}
                  disabled={i === 0 || anyUploading}
                  aria-label="Переместить вверх"
                  title="↑"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="photo-uploader__btn"
                  onClick={() => moveDown(i)}
                  disabled={i === items.length - 1 || anyUploading}
                  aria-label="Переместить вниз"
                  title="↓"
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="photo-uploader__btn photo-uploader__btn--danger"
                  onClick={() => removeItem(i)}
                  disabled={anyUploading}
                  aria-label="Удалить фото"
                  title="×"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
