# TimeRibbons

Spatiotemporal visualization of movement data by unwrapping 2D map paths into 1D ribbons for comparison.

## Demo

[Live Demo](https://nickelm.github.io/time-ribbons/)

## Overview

TimeRibbons lets you draw paths on a map and "unroll" them into straight ribbons that can be compared side-by-side. This technique aligns routes along a common temporal/distance axis, making it easy to compare journeys regardless of their geographic shape.

Based on the transmogrification concept from [Brosz et al., UIST 2013](https://dl.acm.org/doi/10.1145/2501988.2502046).

## Features

- Draw paths directly on an OpenStreetMap base layer
- Touch-friendly for mobile devices
- Automatic map tile capture along paths
- Rotation-corrected ribbon strips (path direction becomes horizontal)
- Multiple path support with color coding
- Side-by-side comparison with proportional scaling
- Distance markers on ribbons

## Usage

1. Open the app and allow location access (optional)
2. Touch/click and drag to draw a path on the map
3. Repeat to add more paths
4. Click "Unroll →" to see ribbons
5. Click "← Map" to return

## Local Development

Just serve the files with any static server:

```bash
python -m http.server 8000
# or
npx serve
```

Then open `http://localhost:8000`

## Files

- `index.html` - Minimal HTML shell
- `css/style.css` - All styles
- `js/app.js` - Application logic

## Dependencies

Loaded via CDN:
- [Leaflet](https://leafletjs.com/) - Map rendering
- [CartoDB Dark Matter](https://carto.com/basemaps/) - Map tiles

## License

MIT License - see [LICENSE](LICENSE)

## Author

Niklas Elmqvist
