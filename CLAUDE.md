# CLAUDE.md - TimeRibbons Project Guide

## Project Overview

TimeRibbons is a spatiotemporal visualization tool that "unrolls" 2D map paths into 1D ribbons for side-by-side comparison. Users draw routes on a map, and the app straightens them into aligned strips showing the map context along the path.

**Core concept**: Sample points along a GPS trajectory, fetch map tiles at each point, rotate each strip to align the travel direction horizontally, then stitch strips into a continuous ribbon.

## Architecture

```
index.html          # Minimal HTML shell, no logic
css/style.css       # All styles, CSS variables for theming
js/app.js           # All application logic (~1100 lines)
```

### Key Components in app.js

- **Tile providers**: `tileProviders` config with Voyager (default), Positron, Dark Matter, OSM
- **State object**: `state` holds paths, map reference, view mode, drawing state, tile provider, ribbon metadata, alignment state
- **Draw mode toggle**: Map starts navigable; Draw button enables path drawing
- **Drawing system**: Touch/mouse handlers capture screen coords → convert to geo coords
- **Path management**: Save, delete, list paths with Leaflet polylines on map
- **Ribbon renderer**: `renderSingleRibbon()` does the core tile-sampling and rotation
- **Tile cache**: `tileCache` Map prevents redundant tile fetches
- **Ribbon interaction**: Cursor line, distance readout, crossing hover highlights, and click-to-align
- **Alignment system**: Click a crossing to align ribbons at that point; click elsewhere to reset

### External Dependencies (CDN)

- Leaflet 1.9.4 - Map rendering and interaction
- CartoDB tiles (Voyager default, Positron, Dark Matter) / OpenStreetMap
- Google Fonts (Sora, JetBrains Mono)

## Key Functions

| Function | Purpose |
|----------|---------|
| `initMap()` | Set up Leaflet map with zoom control, navigable by default |
| `setDrawMode(active)` | Toggle draw mode on/off (enables/disables draw canvas) |
| `locateUser()` | Geolocate and center map on user position |
| `startDrawing/draw/stopDrawing` | Touch/mouse path capture |
| `savePath()` | Store path with polyline and metadata |
| `renderAllRibbons()` | Create ribbon rows for all paths, compute crossings, apply alignment offsets |
| `renderSingleRibbon(canvas, path, maxDist, crossings, options)` | Core algorithm - sample, fetch tiles, rotate, composite, draw crossing/distance markers with alignment support |
| `latLngToTilePixel(lat, lng, z)` | Convert geo coords to tile coordinates |
| `haversine(lat1, lng1, lat2, lng2)` | Distance calculation |
| `computeCumulativeDistances(geoPath)` | Cumulative distance array for a geoPath |
| `segmentIntersection(p1, p2, p3, p4)` | 2D line-segment intersection test |
| `findPathCrossings(pathA, pathB)` | Find all geographic crossings between two paths |
| `computeAllCrossings(paths)` | Build crossing lookup for all path pairs (incl. self) |
| `updateMapCrossingMarkers(crossingsByPath)` | Add/update circle markers on Leaflet map at crossing points |
| `changeTileProvider(key)` | Switch map + ribbon tile provider, clear tile cache |
| `handleRibbonMouseMove/Leave` | Cursor line positioning, distance readout, crossing hover |
| `drawCrossingHighlights()` | Draw/clear glow highlights on overlay canvases for hovered crossing |
| `handleRibbonClick()` | Click crossing to align ribbons, click elsewhere to reset |
| `alignToIntersection(key, anchorId)` | Set alignment state and re-render ribbons aligned at crossing |
| `resetAlignment()` | Clear alignment state and re-render ribbons from start |

## The Ribbon Algorithm

1. Calculate cumulative distances along path
2. Sample N evenly-spaced points by distance (not index)
3. Smooth headings with weighted moving average (sin/cos decomposition)
4. For each sample point:
   - Calculate tile coordinates at current zoom
   - Fetch 3x3 tile grid around point onto 768x768 canvas
   - Rotate tile composite so heading becomes horizontal
   - Extract vertical strip from rotated image
5. Stitch strips left-to-right onto ribbon canvas
6. Draw colored centerline and distance markers (absolute or relative to alignment)
7. Draw crossing markers (dashed lines + diamonds) from other paths
8. When aligned: apply per-ribbon horizontal offset so crossings line up vertically

## Common Tasks

### Add a new data attribute to paths
1. Add field to `pathData` object in `savePath()`
2. Update `updatePathList()` to display it
3. Update `ribbon-row-header` template in `renderAllRibbons()` if needed

### Change map tile provider
Use the tile selector dropdown in the header, or add new entries to `tileProviders` in app.js. Both the Leaflet map layer and ribbon tile fetching update automatically.

### Adjust ribbon appearance
- Height: Change `.ribbon-row-canvas` in CSS and `ribbonHeight` in `renderSingleRibbon()`
- Segment count: Modify `numSegments` calculation in `renderSingleRibbon()`
- Line style: Modify the path line drawing section at end of `renderSingleRibbon()`

### Add GPX import
1. Add file input to HTML
2. Parse GPX XML to extract `<trkpt>` lat/lng values
3. Call `savePath()` variant that accepts external geoPath array

## Code Style

- Vanilla JS, no build step, no frameworks
- Async/await for tile loading
- DOM elements cached in `elements` object
- State mutations through helper functions
- CSS custom properties for colors (`--accent`, `--bg-dark`, etc.)

## Testing Locally

```bash
# Any static server works
python -m http.server 8000
npx serve
php -S localhost:8000
```

## Known Limitations

- Tile fetching is sequential (could parallelize)
- No persistence (paths lost on reload)
- Fixed zoom level for ribbon tiles (uses map zoom + 1)
- No path editing after creation
- Crossing detection uses flat-earth geometry (fine at city scale, inaccurate for very long paths)

## Future Ideas

- GPX/KML file import
- Animated unroll transition showing path straightening
- Time-based alignment mode (Space/Time radio exists as placeholder, Time currently disabled)
- Time-based coloring (speed, heart rate from fitness data)
- Export ribbons as images
- LocalStorage persistence
- Drag-to-reorder ribbon rows