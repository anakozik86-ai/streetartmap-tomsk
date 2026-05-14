import type * as L from 'leaflet';

declare module 'leaflet' {
  namespace Routing {
    interface Waypoint {
      latLng: L.LatLng;
      name?: string;
      options?: Record<string, unknown>;
    }

    interface IRoute {
      coordinates: L.LatLng[];
      summary: { totalDistance: number; totalTime: number };
      waypoints: Waypoint[];
    }

    interface IRouter {
      route(
        waypoints: Waypoint[],
        callback: (err: (IError & Error) | null, routes: IRoute[]) => void,
        context?: object,
        options?: object,
      ): void;
    }

    interface RoutingControlOptions {
      waypoints: (L.LatLng | Waypoint)[];
      router?: IRouter;
      show?: boolean;
      addWaypoints?: boolean;
      routeWhileDragging?: boolean;
      fitSelectedRoutes?: boolean;
      lineOptions?: {
        styles: Array<Record<string, unknown>>;
        extendToWaypoints?: boolean;
        missingRouteTolerance?: number;
      };
      createMarker?: (i: number, wp: Waypoint, n: number) => L.Marker | false;
    }

    interface RoutingControl extends L.Control {
      getWaypoints(): Waypoint[];
      setWaypoints(waypoints: (L.LatLng | Waypoint)[]): this;
      spliceWaypoints(
        index: number,
        waypointsToRemove: number,
        ...waypoints: (L.LatLng | Waypoint)[]
      ): Waypoint[];
      on(event: string, handler?: (e: unknown) => void): this;
      off(event: string, handler?: (e: unknown) => void): this;
    }

    function control(options: RoutingControlOptions): RoutingControl;
    function osrmv1(options: { serviceUrl: string }): IRouter;
  }
}

// Пустое объявление для side-effect import: import 'leaflet-routing-machine'
declare module 'leaflet-routing-machine';
