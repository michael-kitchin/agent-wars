/**
 * Minimal Leaflet typings when the library is loaded from CDN (global `L`) instead of a bundled import.
 */

export {};

declare global {
  namespace LeafletShim {
        /**
     * Documents the `LatLng` interface as a named contract surface (interface LatLng).

     * Purpose: Supports maintainability by documenting why `LatLng` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
interface LatLng {
            /**
       * Specifies the contract for the `lat` member (lat: number;).

       * Contract: Describes stable behavior for callers of `lat` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
lat: number;
            /**
       * Specifies the contract for the `lng` member (lng: number;).

       * Contract: Describes stable behavior for callers of `lng` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
lng: number;
    }
        /**
     * Documents the `Point` interface as a named contract surface (interface Point).

     * Purpose: Supports maintainability by documenting why `Point` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
interface Point {
            /**
       * Specifies the contract for the `x` member (x: number;).

       * Contract: Describes stable behavior for callers of `x` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
x: number;
            /**
       * Specifies the contract for the `y` member (y: number;).

       * Contract: Describes stable behavior for callers of `y` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
y: number;
    }
        /**
     * Documents the `LatLngBounds` interface as a named contract surface (interface LatLngBounds).

     * Purpose: Supports maintainability by documenting why `LatLngBounds` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
interface LatLngBounds {
            /**
       * Specifies the contract for `getSouthWest` (getSouthWest(): LatLng;).

       * Contract: Describes stable behavior for callers of `getSouthWest` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getSouthWest(): LatLng;
            /**
       * Specifies the contract for `getNorthEast` (getNorthEast(): LatLng;).

       * Contract: Describes stable behavior for callers of `getNorthEast` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getNorthEast(): LatLng;
    }
        /**
     * Documents the `MapOptions` interface as a named contract surface (interface MapOptions).

     * Purpose: Supports maintainability by documenting why `MapOptions` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
interface MapOptions {
            /**
       * Specifies the contract for the `minZoom` member (minZoom?: number;).

       * Contract: Describes stable behavior for callers of `minZoom` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
minZoom?: number;
            /**
       * Specifies the contract for the `maxZoom` member (maxZoom?: number;).

       * Contract: Describes stable behavior for callers of `maxZoom` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
maxZoom?: number;
            /**
       * Specifies the contract for the `zoomSnap` member (zoomSnap?: number;).

       * Contract: Describes stable behavior for callers of `zoomSnap` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
zoomSnap?: number;
            /**
       * Specifies the contract for the `zoomDelta` member (zoomDelta?: number;).

       * Contract: Describes stable behavior for callers of `zoomDelta` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
zoomDelta?: number;
            /**
       * Specifies the contract for the `wheelPxPerZoomLevel` member (wheelPxPerZoomLevel?: number;).

       * Contract: Describes stable behavior for callers of `wheelPxPerZoomLevel` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
wheelPxPerZoomLevel?: number;
            /**
       * Specifies the contract for the `worldCopyJump` member (worldCopyJump?: boolean;).

       * Contract: Describes stable behavior for callers of `worldCopyJump` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
worldCopyJump?: boolean;
            /**
       * Specifies the contract for the `maxBounds` member (maxBounds?: LatLngBounds;).

       * Contract: Describes stable behavior for callers of `maxBounds` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
maxBounds?: LatLngBounds;
    }
        /**
     * Documents the `TileLayerOptions` interface as a named contract surface (interface TileLayerOptions).

     * Purpose: Supports maintainability by documenting why `TileLayerOptions` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
interface TileLayerOptions {
            /**
       * Specifies the contract for the `attribution` member (attribution?: string;).

       * Contract: Describes stable behavior for callers of `attribution` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
attribution?: string;
            /**
       * Specifies the contract for the `subdomains` member (subdomains?: string | string[];).

       * Contract: Describes stable behavior for callers of `subdomains` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
subdomains?: string | string[];
            /**
       * Specifies the contract for the `maxZoom` member (maxZoom?: number;).

       * Contract: Describes stable behavior for callers of `maxZoom` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
maxZoom?: number;
            /**
       * Specifies the contract for the `minZoom` member (minZoom?: number;).

       * Contract: Describes stable behavior for callers of `minZoom` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
minZoom?: number;
            /**
       * Specifies the contract for the `tileSize` member (tileSize?: number;).

       * Contract: Describes stable behavior for callers of `tileSize` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
tileSize?: number;
            /**
       * Specifies the contract for the `noWrap` member (noWrap?: boolean;).

       * Contract: Describes stable behavior for callers of `noWrap` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
noWrap?: boolean;
            /**
       * Specifies the contract for the `errorTileUrl` member (errorTileUrl?: string;).

       * Contract: Describes stable behavior for callers of `errorTileUrl` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
errorTileUrl?: string;
    }
        /**
     * Documents the `RectangleOptions` interface as a named contract surface (interface RectangleOptions).

     * Purpose: Supports maintainability by documenting why `RectangleOptions` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
interface RectangleOptions {
            /**
       * Specifies the contract for the `color` member (color?: string;).

       * Contract: Describes stable behavior for callers of `color` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
color?: string;
            /**
       * Specifies the contract for the `weight` member (weight?: number;).

       * Contract: Describes stable behavior for callers of `weight` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
weight?: number;
            /**
       * Specifies the contract for the `fill` member (fill?: boolean;).

       * Contract: Describes stable behavior for callers of `fill` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
fill?: boolean;
            /**
       * Specifies the contract for the `fillOpacity` member (fillOpacity?: number;).

       * Contract: Describes stable behavior for callers of `fillOpacity` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
fillOpacity?: number;
            /**
       * Specifies the contract for the `interactive` member (interactive?: boolean;).

       * Contract: Describes stable behavior for callers of `interactive` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
interactive?: boolean;
    }
        /**
     * Documents the `Map` class as an ambient type surface (class Map).

     * Purpose: Supports maintainability by documenting why `Map` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
class Map {
            /**
       * Constructs the instance for `constructor` (constructor(el: string | HTMLElement, options?: MapOptions);).

       * Purpose: Supports maintainability by documenting why `constructor` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
constructor(el: string | HTMLElement, options?: MapOptions);
            /**
       * Implements behavior for `setView` (setView(center: LatLng, zoom: number): this;).

       * Purpose: Supports maintainability by documenting why `setView` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
setView(center: LatLng, zoom: number): this;
            /**
       * Implements behavior for `getZoom` (getZoom(): number;).

       * Purpose: Supports maintainability by documenting why `getZoom` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getZoom(): number;
            /**
       * Implements behavior for `getCenter` (getCenter(): LatLng;).

       * Purpose: Supports maintainability by documenting why `getCenter` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getCenter(): LatLng;
            /**
       * Implements behavior for `getBounds` (getBounds(): LatLngBounds;).

       * Purpose: Supports maintainability by documenting why `getBounds` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getBounds(): LatLngBounds;
            /**
       * Implements behavior for `latLngToContainerPoint` (latLngToContainerPoint(latlng: LatLng): Point;).

       * Purpose: Supports maintainability by documenting why `latLngToContainerPoint` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
latLngToContainerPoint(latlng: LatLng): Point;
            /**
       * Implements behavior for `containerPointToLatLng` (containerPointToLatLng(point: Point): LatLng;).

       * Purpose: Supports maintainability by documenting why `containerPointToLatLng` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
containerPointToLatLng(point: Point): LatLng;
            /**
       * Implements behavior for `getSize` (getSize(): Point;).

       * Purpose: Supports maintainability by documenting why `getSize` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getSize(): Point;
            /**
       * Implements behavior for `on` (on(type: string, fn: (e: unknown) => void): this;).

       * Purpose: Supports maintainability by documenting why `on` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
on(type: string, fn: (e: unknown) => void): this;
            /**
       * Implements behavior for `invalidateSize` (invalidateSize(options?:).

       * Purpose: Supports maintainability by documenting why `invalidateSize` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
invalidateSize(options?: { animate?: boolean }): this;
            /**
       * Implements behavior for `remove` (remove(): this;).

       * Purpose: Supports maintainability by documenting why `remove` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
remove(): this;
            /**
       * Implements behavior for `fitWorld` (fitWorld(options?:).

       * Purpose: Supports maintainability by documenting why `fitWorld` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
fitWorld(options?: { padding?: number[] }): this;
            /**
       * Implements behavior for `getMinZoom` (getMinZoom(): number;).

       * Purpose: Supports maintainability by documenting why `getMinZoom` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getMinZoom(): number;
            /**
       * Implements behavior for `getMaxZoom` (getMaxZoom(): number;).

       * Purpose: Supports maintainability by documenting why `getMaxZoom` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getMaxZoom(): number;
            /**
       * Implements behavior for `getPixelBounds` (getPixelBounds():).

       * Purpose: Supports maintainability by documenting why `getPixelBounds` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
getPixelBounds(): { min: Point; max: Point };
            /**
       * Documents and orients maintainers to the `doubleClickZoom` field (doubleClickZoom: { disable(): void };).

       * Purpose: Supports maintainability by documenting why `doubleClickZoom` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
doubleClickZoom: { disable(): void };
    }
        /**
     * Documents the `TileLayer` class as an ambient type surface (class TileLayer).

     * Purpose: Supports maintainability by documenting why `TileLayer` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
class TileLayer {
            /**
       * Constructs the instance for `constructor` (constructor(url: string, options?: TileLayerOptions);).

       * Purpose: Supports maintainability by documenting why `constructor` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
constructor(url: string, options?: TileLayerOptions);
            /**
       * Implements behavior for `addTo` (addTo(map: Map): this;).

       * Purpose: Supports maintainability by documenting why `addTo` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
addTo(map: Map): this;
            /**
       * Implements behavior for `on` (on(type: string, fn: (e: unknown) => void): this;).

       * Purpose: Supports maintainability by documenting why `on` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
on(type: string, fn: (e: unknown) => void): this;
    }
        /**
     * Documents the `Rectangle` class as an ambient type surface (class Rectangle).

     * Purpose: Supports maintainability by documenting why `Rectangle` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
class Rectangle {
            /**
       * Constructs the instance for `constructor` (constructor(bounds: LatLngBounds, options?: RectangleOptions);).

       * Purpose: Supports maintainability by documenting why `constructor` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
constructor(bounds: LatLngBounds, options?: RectangleOptions);
            /**
       * Implements behavior for `addTo` (addTo(map: Map): this;).

       * Purpose: Supports maintainability by documenting why `addTo` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
addTo(map: Map): this;
            /**
       * Implements behavior for `setBounds` (setBounds(bounds: LatLngBounds): this;).

       * Purpose: Supports maintainability by documenting why `setBounds` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
setBounds(bounds: LatLngBounds): this;
            /**
       * Implements behavior for `remove` (remove(): void;).

       * Purpose: Supports maintainability by documenting why `remove` exists.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
remove(): void;
    }
        /**
     * Defines the `map` function shape (function map(el: string | HTMLElement, options?: MapOptions): Map;).

     * Purpose: Supports maintainability by documenting why `map` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
function map(el: string | HTMLElement, options?: MapOptions): Map;
        /**
     * Defines the `tileLayer` function shape (function tileLayer(url: string, options?: TileLayerOptions): TileLayer;).

     * Purpose: Supports maintainability by documenting why `tileLayer` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
function tileLayer(url: string, options?: TileLayerOptions): TileLayer;
        /**
     * Defines the `latLng` function shape (function latLng(lat: number, lng: number): LatLng;).

     * Purpose: Supports maintainability by documenting why `latLng` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
function latLng(lat: number, lng: number): LatLng;
        /**
     * Defines the `latLngBounds` function shape (function latLngBounds(southWest: LatLng, northEast: LatLng): LatLngBounds;).

     * Purpose: Supports maintainability by documenting why `latLngBounds` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
function latLngBounds(southWest: LatLng, northEast: LatLng): LatLngBounds;
        /**
     * Defines the `rectangle` function shape (function rectangle(bounds: LatLngBounds, options?: RectangleOptions): Rectangle;).

     * Purpose: Supports maintainability by documenting why `rectangle` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
function rectangle(bounds: LatLngBounds, options?: RectangleOptions): Rectangle;
  }

    /**
   * Documents the module-scope binding `L` (L: typeof LeafletShim & {).

   * Purpose: Supports maintainability by documenting why `L` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
const L: typeof LeafletShim & {
    map: typeof LeafletShim.map;
    tileLayer: typeof LeafletShim.tileLayer;
    latLng: typeof LeafletShim.latLng;
    latLngBounds: typeof LeafletShim.latLngBounds;
    rectangle: typeof LeafletShim.rectangle;
  };
}
