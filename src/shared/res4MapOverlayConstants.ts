/**
 * Locked visual constants for res4 city overlays and Leaflet transport styling, shared by renderer code.
 * City markers (filled circles) and labels are drawn in `res4CityOverlays.ts`; road/rail lines use `res4TransportVectorLayer.ts` (vector JSON only).
 */

/** Alpha for the white halo around city labels (city marker stroke uses vector transport halo opacity instead). */
export const RES4_MAP_OVERLAY_CITY_HALO_ALPHA = 0.55;

/**
 * Opacity for Leaflet vector road black outline (rail white halo uses `RES4_MAP_OVERLAY_VECTOR_RAIL_HALO_OPACITY` instead).
 * When to use: `res4TransportVectorLayer` road outline polylines; `res4CityOverlays` city marker stroke for parity with road edges.
 * Expected outcome: Semi-opaque black edge treatment for roads and city circles.
 */
export const RES4_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY = 0.75;

/** Opacity for Leaflet rail white halo (border) polyline under the dashed black center. */
export const RES4_MAP_OVERLAY_VECTOR_RAIL_HALO_OPACITY = 0.5;

/** Opacity for Leaflet rail black dashed center polyline. */
export const RES4_MAP_OVERLAY_VECTOR_RAIL_CENTER_OPACITY = 0.75;

/** Leaflet polyline weight for road black outline (under the white center stroke). */
export const RES4_MAP_OVERLAY_VECTOR_ROAD_OUTLINE_WEIGHT = 3.3;

/** Leaflet polyline weight for road white center stroke. */
export const RES4_MAP_OVERLAY_VECTOR_ROAD_CENTER_WEIGHT = 2.0;

/** Leaflet polyline weight for rail white halo stroke (under the dashed black center). */
export const RES4_MAP_OVERLAY_VECTOR_RAIL_HALO_WEIGHT = 3.0;

/** Leaflet polyline weight for rail black dashed center stroke. */
export const RES4_MAP_OVERLAY_VECTOR_RAIL_CENTER_WEIGHT = 1.85;

/** Leaflet `dashArray` for rail center polylines (matches canvas rail dash feel). */
export const RES4_MAP_OVERLAY_VECTOR_RAIL_DASH_ARRAY = '7 5';

/** Screen px for stroking the city label halo before filling black text (half prior thickness for subtler halos). */
export const RES4_MAP_OVERLAY_CITY_LABEL_HALO_WIDTH_PX = 2.4;

/** Screen px baseline used to size the city marker (radius scale uses 2× this value vs the legacy filled dot). */
export const RES4_MAP_OVERLAY_CITY_DOT_RADIUS_PX = 4.7;

/** Screen px stroke width for the city marker halo stroke. */
export const RES4_MAP_OVERLAY_CITY_DOT_HALO_WIDTH_PX = 2.3;

/**
 * Circle radius multiplier applied to the reference radius (`RES4_MAP_OVERLAY_CITY_DOT_RADIUS_PX * 2 * zoomStrokeScale`, former star circumradius).
 * When to use: `res4CityOverlays` when sizing the filled city disk.
 * Expected outcome: Radius is `2/3` of the prior `0.375 ×` reference-radius sizing (`0.25 ×` the reference).
 */
export const RES4_MAP_OVERLAY_CITY_CIRCLE_RADIUS_FRAC = 0.25;

/** Alpha for the black outline on road center strokes. */
export const RES4_MAP_OVERLAY_ROAD_OUTLINE_ALPHA = 0.45;

/** Screen px for the road center stroke (white). */
export const RES4_MAP_OVERLAY_ROAD_CENTER_WIDTH_PX = 2.05;

/** Screen px for the road outline stroke (black, drawn underneath). */
export const RES4_MAP_OVERLAY_ROAD_OUTLINE_WIDTH_PX = 3.35;

/** Alpha for the white halo stroke around rail center lines. */
export const RES4_MAP_OVERLAY_RAIL_HALO_ALPHA = 0.5;

/** Screen px for the rail center stroke (black). */
export const RES4_MAP_OVERLAY_RAIL_CENTER_WIDTH_PX = 1.85;

/** Screen px for the rail halo stroke (white, drawn underneath). */
export const RES4_MAP_OVERLAY_RAIL_HALO_WIDTH_PX = 3.05;

/** Perpendicular rail tie stroke width as a fraction of the rail center stroke width. */
export const RES4_MAP_OVERLAY_RAIL_TIE_WIDTH_FACTOR = 0.55;

/** Perpendicular rail tie half-length as a multiple of the rail center stroke width. */
export const RES4_MAP_OVERLAY_RAIL_TIE_HALF_LENGTH_FACTOR = 2.4;

/** Fraction of projected hex span used to nudge city labels slightly above the cell center. */
export const RES4_MAP_OVERLAY_CITY_LABEL_UPWARD_OFFSET_SPAN_FRAC = 0.155;

/**
 * Extra upward label shift in **screen px** (before zoom stroke scale) so lift stays visible when the
 * span-based fraction is small at high zoom.
 */
export const RES4_MAP_OVERLAY_CITY_LABEL_UPWARD_EXTRA_PX = 18;

/**
 * Scales the combined span + px lift that offsets city names above the hex centroid (`0.5` = halfway toward center vs prior lift).
 * When to use: `res4CityOverlays` when computing `labelYBase` before collision nudging.
 */
export const RES4_MAP_OVERLAY_CITY_LABEL_LIFT_SCALE = 0.5;

/** Extra downward nudge in px when a city label bbox would overlap a prior label in the same frame. */
export const RES4_MAP_OVERLAY_CITY_LABEL_COLLISION_STEP_PX = 17;

/** Minimum stroked width (px before zoom scale) for road/rail overlay lines so they stay visible on dense maps. */
export const RES4_MAP_OVERLAY_TRANSPORT_MIN_STROKE_PX = 1.2;

/**
 * Screen-space shift applied to rail segments (px before zoom scale, +x right, +y down) so rail remains
 * visible when road uses the same side slot; shared offset keeps segments aligned across adjacent hexes.
 */
export const RES4_MAP_OVERLAY_RAIL_SCREEN_OFFSET_X_PX = 2.7;

/**
 * Vertical companion to `RES4_MAP_OVERLAY_RAIL_SCREEN_OFFSET_X_PX` for the same rail-vs-road separation.
 */
export const RES4_MAP_OVERLAY_RAIL_SCREEN_OFFSET_Y_PX = 2.1;

/**
 * Extra px (before zoom stroke scale) extended at both endpoints of road segments to hide anti-aliased seam
 * cutoffs near hex boundaries while preserving the mask-inferred chord/spur geometry contract.
 */
export const RES4_MAP_OVERLAY_ROAD_CHORD_ENDPOINT_OVERSHOOT_PX = 1.6;

/**
 * Extra px (before zoom stroke scale) extended at both endpoints of rail segments to hide anti-aliased seam
 * cutoffs near hex boundaries while preserving the mask-inferred chord/spur geometry contract.
 */
export const RES4_MAP_OVERLAY_RAIL_CHORD_ENDPOINT_OVERSHOOT_PX = 2.0;

/**
 * When a mask leaves one unpaired active side, draw a short segment from that side's midpoint toward the cell centroid
 * by this fraction of the full centroid→midpoint vector (reduces starburst clutter vs full spokes).
 */
export const RES4_MAP_OVERLAY_TRANSPORT_CHORD_SPUR_LENGTH_FACTOR = 0.35;

/**
 * Rail ties use a single midpoint tick instead of three when chord length falls below `max(8, span * this fraction)` px.
 */
export const RES4_MAP_OVERLAY_RAIL_TIE_SHORT_SEGMENT_SPAN_FRAC = 0.18;
