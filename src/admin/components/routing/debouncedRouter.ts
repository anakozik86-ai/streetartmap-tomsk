import L from 'leaflet';
import 'leaflet-routing-machine';

const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1';
const DEBOUNCE_MS = 300;
const RETRY_DELAY_MS = 1000;

export interface DebouncedRouter extends L.Routing.IRouter {
  dispose(): void;
}

/**
 * Обёртка над L.Routing.osrmv1 с:
 *  - debounce 300ms — не спамим OSRM при каждом событии
 *  - retry 1×1000ms при сетевой ошибке
 *  - race-guard по requestId — stale callbacks игнорируются
 *  - dispose() для cleanup в useEffect при unmount
 */
export function createDebouncedRouter(): DebouncedRouter {
  const osrm = L.Routing.osrmv1({ serviceUrl: OSRM_FOOT_URL });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;
  let disposed = false;

  return {
    route(waypoints, callback, context, options): void {
      if (disposed) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (retryTimer) clearTimeout(retryTimer);

      const myId = ++requestId;

      debounceTimer = setTimeout(() => {
        if (disposed || myId !== requestId) return;

        osrm.route(
          waypoints,
          (err, routes) => {
            if (disposed || myId !== requestId) return;

            if (err) {
              retryTimer = setTimeout(() => {
                if (disposed || myId !== requestId) return;
                osrm.route(
                  waypoints,
                  (err2, routes2) => {
                    if (disposed || myId !== requestId) return;
                    callback(err2, routes2);
                  },
                  context,
                  options,
                );
              }, RETRY_DELAY_MS);
            } else {
              callback(null, routes);
            }
          },
          context,
          options,
        );
      }, DEBOUNCE_MS);
    },

    dispose(): void {
      disposed = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    },
  };
}
