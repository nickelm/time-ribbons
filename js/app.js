/**
 * TimeRibbons - Spatiotemporal path visualization
 * Unwraps 2D map paths into 1D ribbons for comparison
 */

// Tile providers configuration
const tileProviders = {
    voyager: {
        name: 'Voyager',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        ribbonTileUrl: (x, y, z) => `https://${'abcd'[Math.abs(x + y) % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`
    },
    positron: {
        name: 'Positron',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        ribbonTileUrl: (x, y, z) => `https://${'abcd'[Math.abs(x + y) % 4]}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`
    },
    dark: {
        name: 'Dark Matter',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        ribbonTileUrl: (x, y, z) => `https://${'abcd'[Math.abs(x + y) % 4]}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
    },
    osm: {
        name: 'OpenStreetMap',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        ribbonTileUrl: (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
    }
};

// Application State
const state = {
    drawing: false,
    currentPath: [],
    currentGeoPath: [],
    paths: [],
    map: null,
    tileLayer: null,
    tileProvider: 'voyager',
    view: 'map',
    nextPathId: 1,
    colors: ['#00d4aa', '#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3'],
    drawMode: false,
    ribbonMeta: [],
    hoveredCrossingKey: null,
    alignment: null // { crossingKey, anchorPathId }
};

// Tile cache for ribbon rendering
const tileCache = new Map();

// DOM Elements
const elements = {};

// Initialize DOM references
function initElements() {
    elements.mapContainer = document.getElementById('map-container');
    elements.ribbonContainer = document.getElementById('ribbon-container');
    elements.ribbonRows = document.getElementById('ribbon-rows');
    elements.drawCanvas = document.getElementById('draw-canvas');
    elements.ctx = elements.drawCanvas.getContext('2d');
    elements.status = document.getElementById('status');
    elements.instructions = document.getElementById('instructions');
    elements.pathStats = document.getElementById('path-stats');
    elements.unrollBtn = document.getElementById('unroll-btn');
    elements.clearBtn = document.getElementById('clear-btn');
    elements.backBtn = document.getElementById('back-btn');
    elements.pathList = document.getElementById('path-list');
    elements.pathCount = document.getElementById('path-count');
    elements.pathEmpty = document.getElementById('path-empty');
    elements.ribbonEmpty = document.getElementById('ribbon-empty');
    elements.statPoints = document.getElementById('stat-points');
    elements.statDistance = document.getElementById('stat-distance');
    elements.tileSelect = document.getElementById('tile-select');
    elements.cursorLine = document.getElementById('cursor-line');
    elements.cursorLabel = document.getElementById('cursor-label');
    elements.drawBtn = document.getElementById('draw-btn');
    elements.locateBtn = document.getElementById('locate-btn');
}

// Initialize Leaflet map
function initMap() {
    state.map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([55.6761, 12.5683], 14);

    L.control.zoom({ position: 'bottomright' }).addTo(state.map);

    const provider = tileProviders[state.tileProvider];
    state.tileLayer = L.tileLayer(provider.url, {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);

    // Draw canvas starts non-interactive so the map can be navigated
    elements.drawCanvas.style.pointerEvents = 'none';
}

// Toggle draw mode
function setDrawMode(active) {
    state.drawMode = active;
    elements.drawCanvas.style.pointerEvents = active ? 'auto' : 'none';
    elements.drawBtn.classList.toggle('active', active);
    elements.instructions.classList.toggle('hidden', !active);
    elements.status.textContent = active ? 'Draw a path' : 'Navigate map';
}

// Locate user on map
function locateUser() {
    state.map.locate({ setView: true, maxZoom: 16 });
}

// Switch tile provider for map and ribbons
function changeTileProvider(providerKey) {
    if (!tileProviders[providerKey] || providerKey === state.tileProvider) return;
    state.tileProvider = providerKey;

    if (state.tileLayer) state.map.removeLayer(state.tileLayer);
    const provider = tileProviders[providerKey];
    state.tileLayer = L.tileLayer(provider.url, {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);

    tileCache.clear();
}

// Canvas setup
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    elements.drawCanvas.width = window.innerWidth * dpr;
    elements.drawCanvas.height = window.innerHeight * dpr;
    elements.drawCanvas.style.width = window.innerWidth + 'px';
    elements.drawCanvas.style.height = window.innerHeight + 'px';
    elements.ctx.scale(dpr, dpr);
}

// Get touch/mouse position
function getPosition(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

// Convert screen to geo coordinates
function screenToGeo(x, y) {
    const point = state.map.containerPointToLatLng([x, y]);
    return [point.lat, point.lng];
}

// Haversine distance formula
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Compute cumulative distances array for a geoPath
function computeCumulativeDistances(geoPath) {
    const distances = [0];
    for (let i = 1; i < geoPath.length; i++) {
        const [lat1, lng1] = geoPath[i - 1];
        const [lat2, lng2] = geoPath[i];
        distances.push(distances[i - 1] + haversine(lat1, lng1, lat2, lng2));
    }
    return distances;
}

// Calculate total distance for a path
function calculateDistanceForPath(geoPath) {
    const distances = computeCumulativeDistances(geoPath);
    return distances[distances.length - 1];
}

// Segment-segment intersection in 2D (flat-earth, fine at city scale)
function segmentIntersection(p1, p2, p3, p4) {
    const [lat1, lng1] = p1;
    const [lat2, lng2] = p2;
    const [lat3, lng3] = p3;
    const [lat4, lng4] = p4;

    const dx1 = lat2 - lat1, dy1 = lng2 - lng1;
    const dx2 = lat4 - lat3, dy2 = lng4 - lng3;
    const denom = dx1 * dy2 - dy1 * dx2;

    if (Math.abs(denom) < 1e-12) return null; // parallel or coincident

    const t = ((lat3 - lat1) * dy2 - (lng3 - lng1) * dx2) / denom;
    const u = ((lat3 - lat1) * dy1 - (lng3 - lng1) * dx1) / denom;

    if (t < 0 || t > 1 || u < 0 || u > 1) return null;

    return {
        lat: lat1 + t * dx1,
        lng: lng1 + t * dy1,
        t, u
    };
}

// Find all crossing points between two paths
function findPathCrossings(pathA, pathB) {
    const isSelf = pathA === pathB;
    const crossings = [];
    const distA = computeCumulativeDistances(pathA.geoPath);
    const distB = isSelf ? distA : computeCumulativeDistances(pathB.geoPath);
    const totalA = distA[distA.length - 1];
    const totalB = distB[distB.length - 1];

    for (let i = 0; i < pathA.geoPath.length - 1; i++) {
        const jStart = isSelf ? i + 2 : 0; // skip adjacent segments for self-crossing
        for (let j = jStart; j < pathB.geoPath.length - 1; j++) {
            const result = segmentIntersection(
                pathA.geoPath[i], pathA.geoPath[i + 1],
                pathB.geoPath[j], pathB.geoPath[j + 1]
            );
            if (result) {
                const crossDistA = distA[i] + result.t * (distA[i + 1] - distA[i]);
                const crossDistB = distB[j] + result.u * (distB[j + 1] - distB[j]);
                crossings.push({
                    lat: result.lat, lng: result.lng,
                    distFractionA: totalA > 0 ? crossDistA / totalA : 0,
                    distFractionB: totalB > 0 ? crossDistB / totalB : 0
                });
            }
        }
    }
    return crossings;
}

// Compute crossings for all path pairs (including self-crossings)
function computeAllCrossings(paths) {
    const crossingsByPath = {};
    paths.forEach(p => { crossingsByPath[p.id] = []; });

    for (let a = 0; a < paths.length; a++) {
        // Self-crossings
        const selfCrossings = findPathCrossings(paths[a], paths[a]);
        for (const c of selfCrossings) {
            crossingsByPath[paths[a].id].push({
                distFraction: c.distFractionA,
                otherColor: paths[a].color,
                otherPathId: paths[a].id,
                lat: c.lat, lng: c.lng
            });
            crossingsByPath[paths[a].id].push({
                distFraction: c.distFractionB,
                otherColor: paths[a].color,
                otherPathId: paths[a].id,
                lat: c.lat, lng: c.lng
            });
        }

        // Inter-path crossings
        for (let b = a + 1; b < paths.length; b++) {
            const crossings = findPathCrossings(paths[a], paths[b]);
            for (const c of crossings) {
                crossingsByPath[paths[a].id].push({
                    distFraction: c.distFractionA,
                    otherColor: paths[b].color,
                    otherPathId: paths[b].id,
                    lat: c.lat, lng: c.lng
                });
                crossingsByPath[paths[b].id].push({
                    distFraction: c.distFractionB,
                    otherColor: paths[a].color,
                    otherPathId: paths[a].id,
                    lat: c.lat, lng: c.lng
                });
            }
        }
    }
    return crossingsByPath;
}

// Drawing handlers
function startDrawing(e) {
    e.preventDefault();
    state.drawing = true;
    state.currentPath = [];
    state.currentGeoPath = [];
    
    const pos = getPosition(e);
    state.currentPath.push(pos);
    state.currentGeoPath.push(screenToGeo(pos.x, pos.y));
    
    elements.instructions.classList.add('hidden');
    elements.pathStats.classList.add('visible');
    elements.status.textContent = 'Drawing...';
    state.map.dragging.disable();
}

function draw(e) {
    if (!state.drawing) return;
    e.preventDefault();
    
    const pos = getPosition(e);
    const lastPos = state.currentPath[state.currentPath.length - 1];
    const dist = Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y);
    
    if (dist > 5) {
        state.currentPath.push(pos);
        state.currentGeoPath.push(screenToGeo(pos.x, pos.y));
        drawCurrentPath();
        updateStats();
    }
}

function stopDrawing(e) {
    if (!state.drawing) return;
    e.preventDefault();
    state.drawing = false;
    state.map.dragging.enable();
    
    if (state.currentGeoPath.length > 5) {
        savePath();
    } else {
        elements.status.textContent = 'Draw a longer path';
    }
    
    elements.ctx.clearRect(0, 0, elements.drawCanvas.width, elements.drawCanvas.height);
    state.currentPath = [];
    state.currentGeoPath = [];
    elements.pathStats.classList.remove('visible');
}

// Draw current path on canvas
function drawCurrentPath() {
    elements.ctx.clearRect(0, 0, elements.drawCanvas.width, elements.drawCanvas.height);
    if (state.currentPath.length < 2) return;
    
    const color = state.colors[(state.nextPathId - 1) % state.colors.length];
    
    elements.ctx.beginPath();
    elements.ctx.moveTo(state.currentPath[0].x, state.currentPath[0].y);
    for (let i = 1; i < state.currentPath.length; i++) {
        elements.ctx.lineTo(state.currentPath[i].x, state.currentPath[i].y);
    }
    
    elements.ctx.strokeStyle = color;
    elements.ctx.lineWidth = 4;
    elements.ctx.lineCap = 'round';
    elements.ctx.lineJoin = 'round';
    elements.ctx.stroke();
    
    // Glow
    elements.ctx.strokeStyle = color + '4d';
    elements.ctx.lineWidth = 12;
    elements.ctx.stroke();
}

// Save current path
function savePath() {
    const color = state.colors[(state.nextPathId - 1) % state.colors.length];
    const pathData = {
        id: state.nextPathId++,
        geoPath: [...state.currentGeoPath],
        color: color,
        name: `Path ${state.paths.length + 1}`,
        distance: calculateDistanceForPath(state.currentGeoPath)
    };
    
    pathData.polyline = L.polyline(pathData.geoPath, {
        color: color,
        weight: 4,
        opacity: 0.9
    }).addTo(state.map);
    
    state.paths.push(pathData);
    updatePathList();
    updateUnrollButton();
    elements.status.textContent = `Saved ${pathData.name}`;
    setDrawMode(false);
}

// Update path list UI
function updatePathList() {
    elements.pathCount.textContent = state.paths.length;
    
    if (state.paths.length === 0) {
        elements.pathEmpty.style.display = 'block';
        elements.pathList.querySelectorAll('.path-item').forEach(el => el.remove());
        return;
    }
    
    elements.pathEmpty.style.display = 'none';
    elements.pathList.querySelectorAll('.path-item').forEach(el => el.remove());
    
    state.paths.forEach(path => {
        const item = document.createElement('div');
        item.className = 'path-item';
        item.dataset.id = path.id;
        
        const distStr = path.distance >= 1000 
            ? (path.distance / 1000).toFixed(1) + ' km'
            : Math.round(path.distance) + ' m';
        
        item.innerHTML = `
            <div class="path-color" style="background: ${path.color}"></div>
            <div class="path-info">
                <div class="path-name">${path.name}</div>
                <div class="path-meta">${path.geoPath.length} pts · ${distStr}</div>
            </div>
            <button class="path-delete" title="Delete path">✕</button>
        `;
        
        item.querySelector('.path-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deletePath(path.id);
        });
        
        item.addEventListener('click', () => {
            state.map.fitBounds(path.polyline.getBounds(), { padding: [50, 50] });
        });
        
        elements.pathList.appendChild(item);
    });
}

// Delete a path
function deletePath(id) {
    const idx = state.paths.findIndex(p => p.id === id);
    if (idx === -1) return;
    
    state.map.removeLayer(state.paths[idx].polyline);
    state.paths.splice(idx, 1);
    updatePathList();
    updateUnrollButton();
    elements.status.textContent = 'Path deleted';
}

// Clear all paths
function clearAllPaths() {
    state.paths.forEach(path => state.map.removeLayer(path.polyline));
    if (state.crossingMarkers) {
        state.crossingMarkers.forEach(m => state.map.removeLayer(m));
        state.crossingMarkers = [];
    }
    state.paths = [];
    state.currentPath = [];
    state.currentGeoPath = [];
    state.alignment = null;
    elements.ctx.clearRect(0, 0, elements.drawCanvas.width, elements.drawCanvas.height);
    elements.instructions.classList.toggle('hidden', !state.drawMode);
    elements.pathStats.classList.remove('visible');
    elements.status.textContent = state.drawMode ? 'Draw a path' : 'Navigate map';
    updatePathList();
    updateUnrollButton();
    elements.statPoints.textContent = '0';
    elements.statDistance.textContent = '0';
}

// Update stats display
function updateStats() {
    elements.statPoints.textContent = state.currentPath.length;
    elements.statDistance.textContent = Math.round(calculateDistanceForPath(state.currentGeoPath));
}

// Update unroll button state
function updateUnrollButton() {
    elements.unrollBtn.disabled = state.paths.length === 0;
}

// View switching
async function showRibbon() {
    state.view = 'ribbon';
    elements.mapContainer.classList.add('hidden');
    elements.ribbonContainer.classList.add('visible');
    await renderAllRibbons();
}

function showMap() {
    state.view = 'map';
    elements.mapContainer.classList.remove('hidden');
    elements.ribbonContainer.classList.remove('visible');
}

// Tile loading
async function loadTile(x, y, z) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const provider = tileProviders[state.tileProvider];
        img.src = provider.ribbonTileUrl(x, y, z);
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
    });
}

async function getTile(x, y, z) {
    const key = `${z}/${x}/${y}`;
    if (!tileCache.has(key)) {
        tileCache.set(key, await loadTile(x, y, z));
    }
    return tileCache.get(key);
}

// Render all ribbons
async function renderAllRibbons() {
    elements.ribbonRows.querySelectorAll('.ribbon-row').forEach(el => el.remove());
    state.ribbonMeta = [];
    state.hoveredCrossingKey = null;

    if (state.paths.length === 0) {
        elements.ribbonEmpty.style.display = 'flex';
        return;
    }

    elements.ribbonEmpty.style.display = 'none';
    const maxDistance = Math.max(...state.paths.map(p => p.distance));
    const crossingsByPath = computeAllCrossings(state.paths);
    const viewportWidth = elements.ribbonRows.clientWidth;
    const padding = 20;
    const maxRibbonWidth = viewportWidth - padding * 2;

    // Pre-compute ribbon widths and alignment offsets
    const layouts = state.paths.map(path => ({
        pathId: path.id,
        ribbonWidth: (path.distance / maxDistance) * maxRibbonWidth
    }));

    let drawOffsets = {};
    let totalCanvasWidth = 0; // 0 = use default (viewport width)
    let scrollTarget = 0;
    const aligned = !!state.alignment;

    if (aligned) {
        const anchorLayout = layouts.find(l => l.pathId === state.alignment.anchorPathId);
        const anchorCrossings = crossingsByPath[state.alignment.anchorPathId] || [];
        const anchorCrossing = anchorCrossings.find(c =>
            `${c.lat.toFixed(8)},${c.lng.toFixed(8)}` === state.alignment.crossingKey
        );

        if (anchorCrossing && anchorLayout) {
            const anchorX = padding + anchorCrossing.distFraction * anchorLayout.ribbonWidth;
            let minStart = padding, maxEnd = padding + anchorLayout.ribbonWidth;

            for (const layout of layouts) {
                if (layout.pathId === state.alignment.anchorPathId) {
                    drawOffsets[layout.pathId] = 0;
                    continue;
                }
                const pathCrossings = crossingsByPath[layout.pathId] || [];
                const match = pathCrossings.find(c =>
                    `${c.lat.toFixed(8)},${c.lng.toFixed(8)}` === state.alignment.crossingKey
                );
                if (match) {
                    const thisX = padding + match.distFraction * layout.ribbonWidth;
                    drawOffsets[layout.pathId] = anchorX - thisX;
                } else {
                    drawOffsets[layout.pathId] = 0;
                }
                const start = padding + drawOffsets[layout.pathId];
                const end = start + layout.ribbonWidth;
                minStart = Math.min(minStart, start);
                maxEnd = Math.max(maxEnd, end);
            }

            // Global shift so nothing has negative coordinates
            const globalShift = minStart < 0 ? -minStart + padding : 0;
            for (const id in drawOffsets) drawOffsets[id] += globalShift;
            totalCanvasWidth = maxEnd + globalShift + padding;
            scrollTarget = anchorX + globalShift - viewportWidth / 2;
        } else {
            state.alignment = null; // invalid alignment, reset
        }
    }

    for (const path of state.paths) {
        const row = document.createElement('div');
        row.className = 'ribbon-row';

        const distStr = path.distance >= 1000
            ? (path.distance / 1000).toFixed(2) + ' km'
            : Math.round(path.distance) + ' m';

        row.innerHTML = `
            <div class="ribbon-row-header">
                <div class="ribbon-row-color" style="background: ${path.color}"></div>
                <span class="ribbon-row-name">${path.name}</span>
                <span class="ribbon-row-distance">${distStr}</span>
            </div>
            <div class="ribbon-canvas-wrapper">
                <canvas class="ribbon-row-canvas"></canvas>
                <canvas class="ribbon-overlay-canvas"></canvas>
            </div>
        `;

        elements.ribbonRows.appendChild(row);
        const ribbonCanvas = row.querySelector('.ribbon-row-canvas');
        const overlayCanvas = row.querySelector('.ribbon-overlay-canvas');
        const wrapper = row.querySelector('.ribbon-canvas-wrapper');
        const crossings = crossingsByPath[path.id] || [];

        // Compute per-ribbon rendering options
        const isAnchor = aligned && path.id === state.alignment.anchorPathId;
        const drawOffset = drawOffsets[path.id] || 0;
        let crossingDist = null;
        if (aligned && !isAnchor) {
            const match = crossings.find(c =>
                `${c.lat.toFixed(8)},${c.lng.toFixed(8)}` === state.alignment.crossingKey
            );
            if (match) crossingDist = match.distFraction * path.distance;
        }

        // Set wider width for alignment
        if (totalCanvasWidth > 0) {
            wrapper.style.width = totalCanvasWidth + 'px';
            row.style.width = totalCanvasWidth + 'px';
        }

        const meta = await renderSingleRibbon(ribbonCanvas, path, maxDistance, crossings, {
            drawOffset,
            totalCanvasWidth: totalCanvasWidth || 0,
            viewportWidth,
            crossingDist,
            isAnchor
        });

        overlayCanvas.width = ribbonCanvas.width;
        overlayCanvas.height = ribbonCanvas.height;

        const effectivePadding = meta.padding + drawOffset;
        state.ribbonMeta.push({
            pathId: path.id,
            color: path.color,
            padding: effectivePadding,
            ribbonWidth: meta.ribbonWidth,
            totalDistance: meta.totalDistance,
            crossings: crossings.map(c => ({
                ...c,
                pixelX: effectivePadding + c.distFraction * meta.ribbonWidth
            })),
            canvas: ribbonCanvas,
            overlayCanvas: overlayCanvas,
            row: row
        });
    }

    updateMapCrossingMarkers(crossingsByPath);

    // Scroll to alignment point
    if (aligned && scrollTarget > 0) {
        elements.ribbonRows.scrollLeft = Math.max(0, scrollTarget);
    } else {
        elements.ribbonRows.scrollLeft = 0;
    }
}

// Update crossing markers on the Leaflet map
function updateMapCrossingMarkers(crossingsByPath) {
    // Clear previous markers
    if (state.crossingMarkers) {
        state.crossingMarkers.forEach(m => state.map.removeLayer(m));
    }
    state.crossingMarkers = [];

    // Deduplicate by location (each crossing produces entries on both paths)
    const seen = new Set();
    for (const pathId in crossingsByPath) {
        for (const c of crossingsByPath[pathId]) {
            const key = `${c.lat.toFixed(8)},${c.lng.toFixed(8)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const marker = L.circleMarker([c.lat, c.lng], {
                radius: 6,
                color: '#ffffff',
                fillColor: '#ffffff',
                fillOpacity: 0.8,
                weight: 2
            }).addTo(state.map);
            state.crossingMarkers.push(marker);
        }
    }
}

// Render a single ribbon
async function renderSingleRibbon(canvas, pathData, maxDistance, crossings = [], options = {}) {
    const drawOffset = options.drawOffset || 0;
    const totalCanvasWidth = options.totalCanvasWidth || 0;
    const vpWidth = options.viewportWidth || 0;
    const crossingDist = options.crossingDist; // null = absolute labels
    const isAnchor = options.isAnchor || false;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = totalCanvasWidth || canvas.clientWidth;
    const height = canvas.clientHeight;

    if (totalCanvasWidth) canvas.style.width = totalCanvasWidth + 'px';
    canvas.width = cssWidth * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0d0d15';
    ctx.fillRect(0, 0, cssWidth, height);

    const geoPath = pathData.geoPath;
    const color = pathData.color;

    const distances = computeCumulativeDistances(geoPath);
    const totalDistance = distances[distances.length - 1];

    // Ribbon dimensions - use viewport width for proportional sizing
    const padding = 20;
    const layoutWidth = vpWidth || cssWidth;
    const maxRibbonWidth = layoutWidth - padding * 2;
    const ribbonWidth = (totalDistance / maxDistance) * maxRibbonWidth;
    const effectivePadding = padding + drawOffset;
    const ribbonHeight = height - 20;
    const tileSize = 256;
    
    // Sample points
    const numSegments = Math.min(80, Math.max(20, Math.floor(ribbonWidth / 8)));
    const segmentWidth = Math.ceil(ribbonWidth / numSegments);
    
    const samplePoints = [];
    for (let i = 0; i < numSegments; i++) {
        const targetDist = (i / (numSegments - 1)) * totalDistance;
        
        let segIdx = 0;
        for (let j = 1; j < distances.length; j++) {
            if (distances[j] >= targetDist) {
                segIdx = j - 1;
                break;
            }
            segIdx = j - 1;
        }
        
        const segStart = distances[segIdx];
        const segEnd = distances[segIdx + 1] || distances[segIdx];
        const segLen = segEnd - segStart;
        const t = segLen > 0 ? (targetDist - segStart) / segLen : 0;
        
        const [lat1, lng1] = geoPath[segIdx];
        const [lat2, lng2] = geoPath[Math.min(segIdx + 1, geoPath.length - 1)];
        
        const lat = lat1 + t * (lat2 - lat1);
        const lng = lng1 + t * (lng2 - lng1);
        const heading = Math.atan2(lng2 - lng1, lat2 - lat1);
        
        samplePoints.push({ lat, lng, heading });
    }

    // Smooth headings to reduce strip-to-strip seams
    if (samplePoints.length >= 3) {
        const smoothed = [];
        for (let i = 0; i < samplePoints.length; i++) {
            if (i === 0 || i === samplePoints.length - 1) {
                smoothed.push(samplePoints[i].heading);
            } else {
                const sinAvg = 0.25 * Math.sin(samplePoints[i-1].heading)
                             + 0.50 * Math.sin(samplePoints[i].heading)
                             + 0.25 * Math.sin(samplePoints[i+1].heading);
                const cosAvg = 0.25 * Math.cos(samplePoints[i-1].heading)
                             + 0.50 * Math.cos(samplePoints[i].heading)
                             + 0.25 * Math.cos(samplePoints[i+1].heading);
                smoothed.push(Math.atan2(sinAvg, cosAvg));
            }
        }
        for (let i = 0; i < samplePoints.length; i++) {
            samplePoints[i].heading = smoothed[i];
        }
    }

    const zoom = Math.min(state.map.getZoom() + 1, 17);
    
    function latLngToTilePixel(lat, lng, z) {
        const scale = Math.pow(2, z);
        const worldX = ((lng + 180) / 360) * tileSize * scale;
        const latRad = lat * Math.PI / 180;
        const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileSize * scale;
        return {
            tileX: Math.floor(worldX / tileSize),
            tileY: Math.floor(worldY / tileSize),
            pixelX: worldX % tileSize,
            pixelY: worldY % tileSize
        };
    }
    
    // Reusable canvases for tile compositing and strip extraction
    const tempCanvas = document.createElement('canvas');
    const tempSize = tileSize * 3; // 768px to hold the full 3x3 tile grid
    tempCanvas.width = tempSize;
    tempCanvas.height = tempSize;
    const tempCtx = tempCanvas.getContext('2d');

    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = segmentWidth;
    stripCanvas.height = ribbonHeight;
    const stripCtx = stripCanvas.getContext('2d');

    const offsets = [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
        { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
    ];

    // Draw segments
    for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];
        const tileInfo = latLngToTilePixel(point.lat, point.lng, zoom);

        tempCtx.clearRect(0, 0, tempSize, tempSize);

        for (const offset of offsets) {
            const tile = await getTile(tileInfo.tileX + offset.dx, tileInfo.tileY + offset.dy, zoom);
            if (tile) {
                const drawX = (offset.dx * tileSize) + (tempSize / 2 - tileInfo.pixelX);
                const drawY = (offset.dy * tileSize) + (tempSize / 2 - tileInfo.pixelY);
                tempCtx.drawImage(tile, drawX, drawY);
            }
        }

        stripCtx.setTransform(1, 0, 0, 1, 0, 0);
        stripCtx.clearRect(0, 0, segmentWidth, ribbonHeight);
        stripCtx.translate(segmentWidth / 2, ribbonHeight / 2);
        stripCtx.rotate(-point.heading + Math.PI / 2);
        stripCtx.drawImage(tempCanvas, -tempSize / 2, -tempSize / 2);

        ctx.drawImage(stripCanvas, effectivePadding + i * segmentWidth, 10);
    }
    
    // Draw path line
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(effectivePadding, height / 2);
    ctx.lineTo(effectivePadding + ribbonWidth, height / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Distance markers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px JetBrains Mono, monospace';
    const markerCount = 4;
    const useRelative = crossingDist != null && !isAnchor;
    for (let i = 0; i <= markerCount; i++) {
        const x = effectivePadding + (i / markerCount) * ribbonWidth;
        const absDist = (i / markerCount) * totalDistance;
        let label;
        if (useRelative) {
            const rel = absDist - crossingDist;
            const absRel = Math.abs(rel);
            const sign = rel >= 0 ? '+' : '-';
            label = absRel >= 1000 ? sign + (absRel/1000).toFixed(1) + 'km' : sign + Math.round(absRel) + 'm';
        } else {
            label = absDist >= 1000 ? (absDist/1000).toFixed(1) + 'km' : Math.round(absDist) + 'm';
        }
        ctx.fillRect(x, height - 8, 1, 4);
        if (i < markerCount) ctx.fillText(label, x + 3, height - 3);
    }

    // Draw crossing markers
    for (const crossing of crossings) {
        const x = effectivePadding + crossing.distFraction * ribbonWidth;

        // Dashed vertical line in the other path's color
        ctx.strokeStyle = crossing.otherColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, height - 8);
        ctx.stroke();
        ctx.setLineDash([]);

        // Diamond marker at the centerline
        const cy = height / 2;
        const sz = 5;
        ctx.fillStyle = crossing.otherColor;
        ctx.beginPath();
        ctx.moveTo(x, cy - sz);
        ctx.lineTo(x + sz, cy);
        ctx.lineTo(x, cy + sz);
        ctx.lineTo(x - sz, cy);
        ctx.closePath();
        ctx.fill();
    }

    return { padding, ribbonWidth, totalDistance };
}

// Ribbon interaction: cursor line + crossing hover
function handleRibbonMouseMove(e) {
    const containerRect = elements.ribbonContainer.getBoundingClientRect();
    const mouseX = e.clientX - containerRect.left;

    // Show and position cursor line
    elements.cursorLine.style.display = 'block';
    elements.cursorLine.style.left = mouseX + 'px';

    // Find which ribbon the mouse is over
    let hoveredMeta = null;
    for (const meta of state.ribbonMeta) {
        const rowRect = meta.row.getBoundingClientRect();
        if (e.clientY >= rowRect.top && e.clientY <= rowRect.bottom) {
            hoveredMeta = meta;
            break;
        }
    }

    if (hoveredMeta) {
        const canvasRect = hoveredMeta.canvas.getBoundingClientRect();
        const canvasX = e.clientX - canvasRect.left;
        const fraction = Math.max(0, Math.min(1,
            (canvasX - hoveredMeta.padding) / hoveredMeta.ribbonWidth));
        const dist = fraction * hoveredMeta.totalDistance;
        const label = dist >= 1000
            ? (dist / 1000).toFixed(2) + ' km'
            : Math.round(dist) + ' m';

        elements.cursorLabel.style.display = 'block';
        elements.cursorLabel.style.left = mouseX + 'px';
        elements.cursorLabel.textContent = label;
    } else {
        elements.cursorLabel.style.display = 'none';
    }

    // Check for crossing hover
    let newHoveredKey = null;
    const hitRadius = 10;

    for (const meta of state.ribbonMeta) {
        const canvasRect = meta.canvas.getBoundingClientRect();
        const canvasX = e.clientX - canvasRect.left;
        const canvasY = e.clientY - canvasRect.top;

        if (canvasY < 0 || canvasY > canvasRect.height) continue;

        for (const crossing of meta.crossings) {
            if (Math.abs(canvasX - crossing.pixelX) < hitRadius) {
                newHoveredKey = `${crossing.lat.toFixed(8)},${crossing.lng.toFixed(8)}`;
                break;
            }
        }
        if (newHoveredKey) break;
    }

    if (newHoveredKey !== state.hoveredCrossingKey) {
        state.hoveredCrossingKey = newHoveredKey;
        drawCrossingHighlights();
    }

    // Pointer cursor when hovering near a crossing
    elements.ribbonRows.style.cursor = newHoveredKey ? 'pointer' : '';
}

function handleRibbonMouseLeave() {
    elements.cursorLine.style.display = 'none';
    elements.cursorLabel.style.display = 'none';

    if (state.hoveredCrossingKey) {
        state.hoveredCrossingKey = null;
        drawCrossingHighlights();
    }
}

function drawCrossingHighlights() {
    const dpr = window.devicePixelRatio || 1;

    for (const meta of state.ribbonMeta) {
        const ctx = meta.overlayCanvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, meta.overlayCanvas.width, meta.overlayCanvas.height);

        if (!state.hoveredCrossingKey) continue;

        ctx.scale(dpr, dpr);
        const h = meta.overlayCanvas.height / dpr;

        for (const crossing of meta.crossings) {
            const key = `${crossing.lat.toFixed(8)},${crossing.lng.toFixed(8)}`;
            if (key !== state.hoveredCrossingKey) continue;

            const x = crossing.pixelX;

            // Bright glow line
            ctx.strokeStyle = crossing.otherColor;
            ctx.lineWidth = 4;
            ctx.shadowColor = crossing.otherColor;
            ctx.shadowBlur = 12;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Large diamond with white outline
            const cy = h / 2;
            const sz = 8;
            ctx.fillStyle = crossing.otherColor;
            ctx.beginPath();
            ctx.moveTo(x, cy - sz);
            ctx.lineTo(x + sz, cy);
            ctx.lineTo(x, cy + sz);
            ctx.lineTo(x - sz, cy);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

// Click on ribbon to align at crossing, or click elsewhere to reset
function handleRibbonClick(e) {
    const hitRadius = 10;

    for (const meta of state.ribbonMeta) {
        const canvasRect = meta.canvas.getBoundingClientRect();
        const canvasX = e.clientX - canvasRect.left;
        const canvasY = e.clientY - canvasRect.top;

        if (canvasY < 0 || canvasY > canvasRect.height) continue;

        for (const crossing of meta.crossings) {
            if (Math.abs(canvasX - crossing.pixelX) < hitRadius) {
                // Self-crossing: treat as deselect, not alignment
                if (crossing.otherPathId === meta.pathId) {
                    if (state.alignment) resetAlignment();
                    return;
                }
                const key = `${crossing.lat.toFixed(8)},${crossing.lng.toFixed(8)}`;
                alignToIntersection(key, meta.pathId);
                return;
            }
        }
    }

    // Clicked outside any crossing → reset alignment
    if (state.alignment) {
        resetAlignment();
    }
}

// Align all ribbons to a specific crossing point
async function alignToIntersection(crossingKey, anchorPathId) {
    state.alignment = { crossingKey, anchorPathId };
    await renderAllRibbons();
}

// Reset alignment so all ribbons start from left
async function resetAlignment() {
    state.alignment = null;
    await renderAllRibbons();
}

// Event binding
function bindEvents() {
    const canvas = elements.drawCanvas;
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing, { passive: false });
    canvas.addEventListener('touchcancel', stopDrawing, { passive: false });
    
    elements.unrollBtn.addEventListener('click', showRibbon);
    elements.clearBtn.addEventListener('click', clearAllPaths);
    elements.backBtn.addEventListener('click', showMap);

    elements.tileSelect.addEventListener('change', (e) => changeTileProvider(e.target.value));

    if (elements.drawBtn) {
        elements.drawBtn.addEventListener('click', () => setDrawMode(!state.drawMode));
    }
    if (elements.locateBtn) {
        elements.locateBtn.addEventListener('click', locateUser);
    }

    elements.ribbonRows.addEventListener('mousemove', handleRibbonMouseMove);
    elements.ribbonRows.addEventListener('mouseleave', handleRibbonMouseLeave);
    elements.ribbonRows.addEventListener('click', handleRibbonClick);

    window.addEventListener('resize', () => {
        resizeCanvas();
        if (state.view === 'ribbon') renderAllRibbons();
    });
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initMap();
    resizeCanvas();
    bindEvents();
});
