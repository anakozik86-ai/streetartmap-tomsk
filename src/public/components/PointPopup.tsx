import { useState, useEffect, useCallback } from 'preact/hooks';
import { selectedPoint } from '../state/selectedPoint.ts';
import { activeRouteIds, toggleRoute, routesForPoint } from '../state/routes.ts';
import { loadRoutes } from '@shared/utils/loadData.ts';
import type { Route } from '@shared/types/index.ts';
import ru from '../../../locales/ru.json';

// ── Photo URL helpers ─────────────────────────────────────────────────────────

function photoUrl(pointId: string, filename: string, size: 'thumb' | 'medium' | 'full'): string {
  return `${import.meta.env.BASE_URL}images/${pointId}/${filename}-${size}.jpg`;
}

// ── PhotoSlider ───────────────────────────────────────────────────────────────

interface PhotoSliderProps {
  pointId: string;
  photos: { filename: string; caption?: string; width: number; height: number }[];
  onOpenLightbox: (index: number) => void;
}

function PhotoSlider({ pointId, photos, onOpenLightbox }: PhotoSliderProps) {
  const [index, setIndex] = useState(0);

  // Reset when point changes
  useEffect(() => {
    setIndex(0);
  }, [pointId]);

  if (photos.length === 0) return null;

  const photo = photos[index]!;
  const total = photos.length;

  function prev(e: MouseEvent) {
    e.stopPropagation();
    setIndex((i) => (i - 1 + total) % total);
  }

  function next(e: MouseEvent) {
    e.stopPropagation();
    setIndex((i) => (i + 1) % total);
  }

  return (
    <div class="pp-slider">
      <div
        class="pp-slider__frame"
        onClick={() => onOpenLightbox(index)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpenLightbox(index);
        }}
        aria-label="Открыть фото"
      >
        <img
          class="pp-slider__img"
          src={photoUrl(pointId, photo.filename, 'medium')}
          alt={photo.caption ?? ''}
          width={photo.width}
          height={photo.height}
          loading="eager"
        />
        {total > 1 && (
          <span class="pp-slider__counter">
            {index + 1} / {total}
          </span>
        )}
      </div>

      {total > 1 && (
        <>
          <button
            class="pp-slider__arrow pp-slider__arrow--prev"
            type="button"
            onClick={prev}
            aria-label="Предыдущее фото"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 18l-6-6 6-6"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="pp-slider__arrow pp-slider__arrow--next"
            type="button"
            onClick={next}
            aria-label="Следующее фото"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 18l6-6-6-6"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <div class="pp-slider__dots" role="tablist" aria-label="Фото">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                class={`pp-slider__dot${i === index ? ' pp-slider__dot--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                aria-label={`Фото ${i + 1}`}
                aria-selected={i === index}
              />
            ))}
          </div>
        </>
      )}

      {photo.caption && <p class="pp-slider__caption">{photo.caption}</p>}
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
  pointId: string;
  photos: { filename: string; caption?: string; credit?: string; width: number; height: number }[];
  initialIndex: number;
  onClose: () => void;
}

function Lightbox({ pointId, photos, initialIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const total = photos.length;
  const photo = photos[index]!;

  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  return (
    <div
      class="pp-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        class="pp-lightbox__close"
        type="button"
        onClick={onClose}
        aria-label={ru.common.close}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>

      <div class="pp-lightbox__stage">
        <img
          class="pp-lightbox__img"
          src={photoUrl(pointId, photo.filename, 'full')}
          alt={photo.caption ?? ''}
          width={photo.width}
          height={photo.height}
        />
        {(photo.caption || photo.credit) && (
          <div class="pp-lightbox__caption">
            {photo.caption && <span class="pp-lightbox__caption-text">{photo.caption}</span>}
            {photo.credit && <span class="pp-lightbox__credit">© {photo.credit}</span>}
          </div>
        )}
      </div>

      {total > 1 && (
        <>
          <button
            class="pp-lightbox__arrow pp-lightbox__arrow--prev"
            type="button"
            onClick={prev}
            aria-label="Предыдущее фото"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 18l-6-6 6-6"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="pp-lightbox__arrow pp-lightbox__arrow--next"
            type="button"
            onClick={next}
            aria-label="Следующее фото"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 18l6-6-6-6"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <div class="pp-lightbox__counter">
            {index + 1} / {total}
          </div>
        </>
      )}
    </div>
  );
}

// ── PointPopup ────────────────────────────────────────────────────────────────

export function PointPopup() {
  const p = selectedPoint.value;
  const [pointRoutes, setPointRoutes] = useState<Route[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!p) {
      setPointRoutes([]);
      setLightboxIndex(null);
      return;
    }
    loadRoutes()
      .then((routes) => {
        setPointRoutes(routesForPoint(p.id, routes));
      })
      .catch(() => {
        setPointRoutes([]);
      });
  }, [p?.id]);

  if (!p) return null;

  const stateLabel = ru.states[p.state as keyof typeof ru.states] ?? ru.states.unknown;
  const stateClass = `point-popup__state point-popup__state--${p.state}`;

  const handleClose = () => {
    selectedPoint.value = null;
  };

  return (
    <>
      <div class="point-popup" role="dialog" aria-modal="true" aria-label={p.title}>
        <div class="point-popup__header">
          <button
            class="point-popup__close"
            onClick={handleClose}
            aria-label={ru.common.close}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        {p.photos.length > 0 && (
          <PhotoSlider
            pointId={p.id}
            photos={p.photos}
            onOpenLightbox={(i) => setLightboxIndex(i)}
          />
        )}

        <div class="point-popup__body">
          <h2 class="point-popup__title">{p.title}</h2>
          <span class={stateClass}>{stateLabel}</span>

          {p.description && <p class="point-popup__description">{p.description}</p>}

          <dl class="point-popup__meta">
            {p.year_created !== undefined && (
              <>
                <dt>{ru.popup.year}</dt>
                <dd>{p.year_created}</dd>
              </>
            )}
            {p.dimensions && (
              <>
                <dt>{ru.popup.dimensions}</dt>
                <dd>{p.dimensions}</dd>
              </>
            )}
            {p.materials.length > 0 && (
              <>
                <dt>{ru.popup.materials}</dt>
                <dd>{p.materials.join(', ')}</dd>
              </>
            )}
            {p.state_checked_at && (
              <>
                <dt>{ru.popup.checked_at}</dt>
                <dd>
                  {new Date(p.state_checked_at).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </dd>
              </>
            )}
          </dl>

          {pointRoutes.length > 0 && (
            <div class="point-popup__routes">
              <span class="point-popup__routes-label">{ru.popup.routes}</span>
              <div class="point-popup__routes-list">
                {pointRoutes.map((route) => {
                  const isActive = activeRouteIds.value.has(route.id);
                  return (
                    <button
                      key={route.id}
                      type="button"
                      class={`point-popup__route-btn${isActive ? ' is-active' : ''}`}
                      onClick={() => toggleRoute(route.id)}
                      title={isActive ? 'Скрыть маршрут' : 'Показать маршрут на карте'}
                    >
                      {route.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && p.photos.length > 0 && (
        <Lightbox
          pointId={p.id}
          photos={p.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
