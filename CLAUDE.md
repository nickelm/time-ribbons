# CLAUDE.md - TimeRibbons Project Guide

## Project Overview

TimeRibbons is a spatiotemporal visualization tool that "unrolls" 2D map paths into 1D ribbons for side-by-side comparison. Users draw routes on a map, and the app straightens them into aligned strips showing the map context along the path.

**Core concept**: Sample points along a GPS trajectory, fetch map tiles at each point, rotate each strip to align the travel direction horizontally, then stitch strips into a continuous ribbon.

## Architecture

```
index.html          # Minimal HTML shell, no logic
css/style.css       # All styles, CSS variables for theming
js/app.js           # All application logic (~400 lines)
```

### Key Components in app.js

- **State object**: `state` holds paths, map reference, view mode, drawing state
- **Drawing system**: Touch/mouse handlers capture screen coords → convert to geo coords
- **Path management**: Save, delete, list paths with Leaflet polylines on map
- **Ribbon renderer**: `renderSingleRibbon()` does the core tile-sampling and rotation
- **Tile cache**: `tileCache` Map prevents redundant tile fetches

### External Dependencies (CDN)

- Leaflet 1.9.4 - Map rendering and interaction
- CartoDB Dark Matter tiles - Base map layer
- Google Fonts (Sora, JetBrains Mono)

## Key Functions

| Function | Purpose |
|----------|---------|
| `initMap()` | Set up Leaflet map with dark tiles |
| `startDrawing/draw/stopDrawing` | Touch/mouse path capture |
| `savePath()` | Store path with polyline and metadata |
| `renderAllRibbons()` | Create ribbon rows for all paths |
| `renderSingleRibbon(canvas, path, maxDist)` | Core algorithm - sample, fetch tiles, rotate, composite |
| `latLngToTilePixel(lat, lng, z)` | Convert geo coords to tile coordinates |
| `haversine(lat1, lng1, lat2, lng2)` | Distance calculation |

## The Ribbon Algorithm

1. Calculate cumulative distances along path
2. Sample N evenly-spaced points by distance (not index)
3. For each sample point:
   - Calculate tile coordinates at current zoom
   - Fetch 3x3 tile grid around point (for rotation headroom)
   - Compute heading (direction of travel) from adjacent points
   - Rotate tile composite so heading becomes horizontal
   - Extract vertical strip from rotated image
4. Stitch strips left-to-right onto ribbon canvas
5. Draw colored centerline and distance markers

## Common Tasks

### Add a new data attribute to paths
1. Add field to `pathData` object in `savePath()`
2. Update `updatePathList()` to display it
3. Update `ribbon-row-header` template in `renderAllRibbons()` if needed

### Change map tile provider
In `initMap()`, change the `L.tileLayer()` URL. Also update `loadTile()` to match.

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

## Future Ideas

- GPX/KML file import
- Animated unroll transition showing path straightening
- Time-based coloring (speed, heart rate from fitness data)
- Vertical alignment options (start, end, midpoint)
- Export ribbons as images
- LocalStorage persistence
- Drag-to-reorder ribbon rows