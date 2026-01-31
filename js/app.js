/**
 * TimeRibbons - Spatiotemporal path visualization
 * Unwraps 2D map paths into 1D ribbons for comparison
 */

// Application State
const state = {
    drawing: false,
    currentPath: [],
    currentGeoPath: [],
    paths: [],
    map: null,
    view: 'map',
    nextPathId: 1,
    colors: ['#00d4aa', '#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3']
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
}

// Initialize Leaflet map
function initMap() {
    state.map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([55.6761, 12.5683], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(state.map);

    // Try geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => state.map.setView([pos.coords.latitude, pos.coords.longitude], 15),
            () => {}
        );
    }
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

// Calculate total distance for a path
function calculateDistanceForPath(geoPath) {
    let total = 0;
    for (let i = 1; i < geoPath.length; i++) {
        const [lat1, lng1] = geoPath[i - 1];
        const [lat2, lng2] = geoPath[i];
        total += haversine(lat1, lng1, lat2, lng2);
    }
    return total;
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
    state.paths = [];
    state.currentPath = [];
    state.currentGeoPath = [];
    elements.ctx.clearRect(0, 0, elements.drawCanvas.width, elements.drawCanvas.height);
    elements.instructions.classList.remove('hidden');
    elements.pathStats.classList.remove('visible');
    elements.status.textContent = 'Draw a path';
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
        const subdomains = ['a', 'b', 'c', 'd'];
        const s = subdomains[Math.abs(x + y) % subdomains.length];
        img.src = `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
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
    
    if (state.paths.length === 0) {
        elements.ribbonEmpty.style.display = 'flex';
        return;
    }
    
    elements.ribbonEmpty.style.display = 'none';
    const maxDistance = Math.max(...state.paths.map(p => p.distance));
    
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
            <canvas class="ribbon-row-canvas"></canvas>
        `;
        
        elements.ribbonRows.appendChild(row);
        await renderSingleRibbon(row.querySelector('canvas'), path, maxDistance);
    }
}

// Render a single ribbon
async function renderSingleRibbon(canvas, pathData, maxDistance) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0d0d15';
    ctx.fillRect(0, 0, width, height);
    
    const geoPath = pathData.geoPath;
    const color = pathData.color;
    
    // Calculate cumulative distances
    const distances = [0];
    for (let i = 1; i < geoPath.length; i++) {
        const [lat1, lng1] = geoPath[i - 1];
        const [lat2, lng2] = geoPath[i];
        distances.push(distances[i-1] + haversine(lat1, lng1, lat2, lng2));
    }
    const totalDistance = distances[distances.length - 1];
    
    // Ribbon dimensions
    const padding = 20;
    const maxRibbonWidth = width - padding * 2;
    const ribbonWidth = (totalDistance / maxDistance) * maxRibbonWidth;
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
    
    // Draw segments
    for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i];
        const tileInfo = latLngToTilePixel(point.lat, point.lng, zoom);
        
        const tempCanvas = document.createElement('canvas');
        const tempSize = 256;
        tempCanvas.width = tempSize;
        tempCanvas.height = tempSize;
        const tempCtx = tempCanvas.getContext('2d');
        
        const offsets = [
            { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
            { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
            { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
        ];
        
        for (const offset of offsets) {
            const tile = await getTile(tileInfo.tileX + offset.dx, tileInfo.tileY + offset.dy, zoom);
            if (tile) {
                const drawX = (offset.dx * tileSize) + (tempSize / 2 - tileInfo.pixelX);
                const drawY = (offset.dy * tileSize) + (tempSize / 2 - tileInfo.pixelY);
                tempCtx.drawImage(tile, drawX, drawY);
            }
        }
        
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = segmentWidth;
        stripCanvas.height = ribbonHeight;
        const stripCtx = stripCanvas.getContext('2d');
        
        stripCtx.translate(segmentWidth / 2, ribbonHeight / 2);
        stripCtx.rotate(-point.heading + Math.PI / 2);
        stripCtx.drawImage(tempCanvas, -tempSize / 2, -tempSize / 2);
        
        ctx.drawImage(stripCanvas, padding + i * segmentWidth, 10);
    }
    
    // Draw path line
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(padding, height / 2);
    ctx.lineTo(padding + ribbonWidth, height / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Distance markers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px JetBrains Mono, monospace';
    const markerCount = 4;
    for (let i = 0; i <= markerCount; i++) {
        const x = padding + (i / markerCount) * ribbonWidth;
        const dist = (i / markerCount) * totalDistance;
        const label = dist >= 1000 ? (dist/1000).toFixed(1) + 'km' : Math.round(dist) + 'm';
        ctx.fillRect(x, height - 8, 1, 4);
        if (i < markerCount) ctx.fillText(label, x + 3, height - 3);
    }
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
