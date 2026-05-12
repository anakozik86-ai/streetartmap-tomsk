import { useState, useEffect } from 'preact/hooks';
import { selectedPoint } from '../state/selectedPoint.ts';
import { activeRouteIds, toggleRoute, routesForPoint } from '../state/routes.ts';
import { loadRoutes } from '@shared/utils/loadData.ts';
import type { Route } from '@shared/types/index.ts';
import ru from '../../../locales/ru.json';

export function PointPopup() {
  const p = selectedPoint.value;
  const [pointRoutes, setPointRoutes] = useState<Route[]>([]);

  useEffect(() => {
    if (!p) {
      setPointRoutes([]);
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

  const photos = p.photos.slice(0, 3);
  const extraPhotos = p.photos.length - 3;

  const stateLabel =
    ru.states[p.state as keyof typeof ru.states] ?? ru.states.unknown;
  const stateClass = `point-popup__state point-popup__state--${p.state}`;

  const handleClose = () => {
    selectedPoint.value = null;
  };

  return (
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

      {photos.length > 0 && (
        <div class="point-popup__photos">
          {photos.map((photo, i) => (
            <div key={photo.filename} class="point-popup__photo-wrap">
              <img
                class="point-popup__photo"
                src={`${import.meta.env.BASE_URL}images/points/${photo.filename}`}
                alt={photo.caption ?? p.title}
                width={photo.width}
                height={photo.height}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
              {i === 2 && extraPhotos > 0 && (
                <span class="point-popup__photo-more">+{extraPhotos}</span>
              )}
            </div>
          ))}
        </div>
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
  );
}
