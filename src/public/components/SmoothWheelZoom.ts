/* ============================================================
 * SmoothWheelZoom v3 — плавный зум колесом для Leaflet.
 *
 * Использует приватный _move() для скорости (setZoomAround
 * каждый кадр ломает рендер тайлов), но с тройной защитой
 * от выхода за minZoom/maxZoom:
 *   1. Clamp _goalZoom после каждого wheel event
 *   2. Clamp _goalZoom повторно в _updateWheelZoom
 *   3. Clamp newZoom + early return если новый zoom == текущий
 *
 * Использование:
 *   import './SmoothWheelZoom.ts'
 *   L.map(el, { scrollWheelZoom: false, smoothWheelZoom: true })
 * ============================================================ */

import L from 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    smoothWheelZoom?: boolean;
    smoothSensitivity?: number;
  }
}

L.Map.mergeOptions({
  smoothWheelZoom: true,
  smoothSensitivity: 1,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const SmoothWheelZoom = L.Handler.extend({
  addHooks(this: any) {
    L.DomEvent.on(this._map._container, 'wheel', this._onWheelScroll, this);
  },

  removeHooks(this: any) {
    L.DomEvent.off(this._map._container, 'wheel', this._onWheelScroll, this);
  },

  _onWheelScroll(this: any, e: WheelEvent) {
    if (!this._isWheeling) {
      this._onWheelStart(e);
    }
    this._onWheeling(e);
  },

  _onWheelStart(this: any, e: WheelEvent) {
    const map = this._map;
    this._isWheeling = true;
    this._wheelMousePosition = map.mouseEventToContainerPoint(e);
    this._centerPoint = map.getSize().divideBy(2);
    this._wheelStartLatLng = map.containerPointToLatLng(this._wheelMousePosition);
    this._goalZoom = map.getZoom();
    this._prevCenter = map.getCenter();
    this._prevZoom = map.getZoom();
    this._moved = false;

    map._stop();
    if (map._panAnim) map._panAnim.stop();

    this._zoomAnimationId = requestAnimationFrame(() => this._updateWheelZoom());
  },

  _onWheeling(this: any, e: WheelEvent) {
    const map = this._map;
    const sensitivity = (map.options.smoothSensitivity as number) ?? 1;

    this._goalZoom += L.DomEvent.getWheelDelta(e) * 0.003 * sensitivity;

    // Защита 1: clamp _goalZoom после изменения
    const min = map.getMinZoom();
    const max = map.getMaxZoom();
    if (this._goalZoom < min) this._goalZoom = min;
    if (this._goalZoom > max) this._goalZoom = max;

    this._wheelMousePosition = map.mouseEventToContainerPoint(e);

    clearTimeout(this._timeoutId);
    this._timeoutId = window.setTimeout(() => this._onWheelEnd(), 200);

    L.DomEvent.preventDefault(e);
    L.DomEvent.stopPropagation(e);
  },

  _onWheelEnd(this: any) {
    this._isWheeling = false;
    cancelAnimationFrame(this._zoomAnimationId);
    if (this._moved) {
      this._map._moveEnd(true);
    }
  },

  _updateWheelZoom(this: any) {
    const map = this._map;
    const currentZoom = map.getZoom();
    const min = map.getMinZoom();
    const max = map.getMaxZoom();

    // Если карту подвигали извне — выходим
    if (!map.getCenter().equals(this._prevCenter) || currentZoom !== this._prevZoom) {
      return;
    }

    // Защита 2: повторный clamp _goalZoom
    if (this._goalZoom < min) this._goalZoom = min;
    if (this._goalZoom > max) this._goalZoom = max;

    const diff = this._goalZoom - currentZoom;

    // Если goalZoom == currentZoom (например, оба уперлись в minZoom) — не двигаем
    if (Math.abs(diff) < 0.01) {
      this._zoomAnimationId = requestAnimationFrame(() => this._updateWheelZoom());
      return;
    }

    let newZoom = currentZoom + diff * 0.3;

    // Защита 3: clamp newZoom
    if (newZoom < min) newZoom = min;
    if (newZoom > max) newZoom = max;
    newZoom = Math.round(newZoom * 100) / 100;

    // Если после clamp ничего не изменилось — стоп
    if (Math.abs(newZoom - currentZoom) < 0.001) {
      this._zoomAnimationId = requestAnimationFrame(() => this._updateWheelZoom());
      return;
    }

    const delta = this._wheelMousePosition.subtract(this._centerPoint);
    const newCenter = map.unproject(
      map.project(this._wheelStartLatLng, newZoom).subtract(delta),
      newZoom,
    );

    if (!this._moved) {
      map._moveStart(true, false);
      this._moved = true;
    }

    map._move(newCenter, newZoom);
    this._prevCenter = map.getCenter();
    this._prevZoom = map.getZoom();
    this._zoomAnimationId = requestAnimationFrame(() => this._updateWheelZoom());
  },
});

(L.Map as any).addInitHook('addHandler', 'smoothWheelZoom', SmoothWheelZoom);
/* eslint-enable @typescript-eslint/no-explicit-any */

export {};
