/**
 * Minimal Leaflet typings when the library is loaded from CDN (global `L`) instead of a bundled import.
 */

export {};

declare global {
  namespace LeafletShim {
    interface LatLng {
      lat: number;
      lng: number;
    }
    interface Point {
      x: number;
      y: number;
    }
    interface LatLngBounds {
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
    }
    interface MapOptions {
      minZoom?: number;
      maxZoom?: number;
      zoomSnap?: number;
      zoomDelta?: number;
      wheelPxPerZoomLevel?: number;
      worldCopyJump?: boolean;
      maxBounds?: LatLngBounds;
    }
    interface TileLayerOptions {
      attribution?: string;
      subdomains?: string | string[];
      maxZoom?: number;
      minZoom?: number;
      tileSize?: number;
      noWrap?: boolean;
      errorTileUrl?: string;
    }
    interface RectangleOptions {
      color?: string;
      weight?: number;
      fill?: boolean;
      fillOpacity?: number;
      interactive?: boolean;
    }
    class Map {
      constructor(el: string | HTMLElement, options?: MapOptions);
      setView(center: LatLng, zoom: number): this;
      getZoom(): number;
      getCenter(): LatLng;
      getBounds(): LatLngBounds;
      latLngToContainerPoint(latlng: LatLng): Point;
      containerPointToLatLng(point: Point): LatLng;
      getSize(): Point;
      on(type: string, fn: (e: unknown) => void): this;
      invalidateSize(options?: { animate?: boolean }): this;
      remove(): this;
      fitWorld(options?: { padding?: number[] }): this;
      getMinZoom(): number;
      getMaxZoom(): number;
      getPixelBounds(): { min: Point; max: Point };
      doubleClickZoom: { disable(): void };
    }
    class TileLayer {
      constructor(url: string, options?: TileLayerOptions);
      addTo(map: Map): this;
      on(type: string, fn: (e: unknown) => void): this;
    }
    class Rectangle {
      constructor(bounds: LatLngBounds, options?: RectangleOptions);
      addTo(map: Map): this;
      setBounds(bounds: LatLngBounds): this;
      remove(): void;
    }
    function map(el: string | HTMLElement, options?: MapOptions): Map;
    function tileLayer(url: string, options?: TileLayerOptions): TileLayer;
    function latLng(lat: number, lng: number): LatLng;
    function latLngBounds(southWest: LatLng, northEast: LatLng): LatLngBounds;
    function rectangle(bounds: LatLngBounds, options?: RectangleOptions): Rectangle;
  }

  const L: typeof LeafletShim & {
    map: typeof LeafletShim.map;
    tileLayer: typeof LeafletShim.tileLayer;
    latLng: typeof LeafletShim.latLng;
    latLngBounds: typeof LeafletShim.latLngBounds;
    rectangle: typeof LeafletShim.rectangle;
  };
}
