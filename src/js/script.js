const DEFAULT_BOUNDS = [
    [-74.2709, 40.48972],
    [-73.7042, 40.93288]
];
const DEFAULT_LOC = { lat: 40.7128, lng: -74.0060 };

let map;
let markers = [];
let userMarker = null;
let userLocation = null;

function initializeMap() {
    map = new mapboxgl.Map({
        accessToken: 'pk.eyJ1IjoiYmxhY2VuMSIsImEiOiJjbThxOWR0OHAwNmExMm1vbWMzMWl3cXg1In0.pY-Yl_tn3glZjgf8L3gJUg',
        container: 'map',
        style: 'mapbox://styles/mapbox/standard',
        center: [DEFAULT_LOC.lng, DEFAULT_LOC.lat],
        zoom: 13
    });

    map.on('load', () => {
        map.addSource('bounds', {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [DEFAULT_BOUNDS[0][0], DEFAULT_BOUNDS[0][1]],
                        [DEFAULT_BOUNDS[0][0], DEFAULT_BOUNDS[1][1]],
                        [DEFAULT_BOUNDS[1][0], DEFAULT_BOUNDS[1][1]],
                        [DEFAULT_BOUNDS[1][0], DEFAULT_BOUNDS[0][1]],
                        [DEFAULT_BOUNDS[0][0], DEFAULT_BOUNDS[0][1]]
                    ]]
                }
            }
        });

        map.addLayer({
            id: 'line-bounding-box',
            type: 'line',
            source: 'bounds',
            paint: {
                'line-color': '#3386c0',
                'line-width': 3,
                'line-opacity': 0.9
            }
        });

        tryGeolocation();
    });
}

function tryGeolocation() {
    if (!navigator.geolocation) {
        userLocation = DEFAULT_LOC;
        showStatus('Geolocation not supported. Using default location.', 'warning');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            userLocation = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };
            map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 13 });
            addUserMarker(userLocation);
            showStatus("Location found! Click 'Find Quiet Spots' to search.", 'success');
        },
        (err) => {
            console.warn('Geolocation denied/failed:', err);
            userLocation = DEFAULT_LOC;
            showStatus('Could not access your location. Using default.', 'warning');
        }
    );
}

function addUserMarker(position) {
    if (userMarker) userMarker.remove();

    const el = document.createElement('div');
    el.innerHTML = '📍';
    el.style.fontSize = '24px';
    el.style.cursor = 'pointer';

    userMarker = new mapboxgl.Marker({ element: el })
        .setLngLat([position.lng, position.lat])
        .setPopup(new mapboxgl.Popup().setHTML('<b>You are here</b>'))
        .addTo(map);
}

function getDistance(coord1, coord2) {
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(coord2.lat - coord1.lat);
    const dLon = toRad(coord2.lng - coord1.lng);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPlaceType(tags) {
    if (tags.leisure === 'park') return 'Park 🌿';
    if (tags.amenity === 'library') return 'Library 📚';
    if (tags.amenity === 'cafe') return 'Cafe ☕';
    return 'Place';
}

function calculateQuietScore(type, distance) {
    let base = 0;
    if (type.includes('Library')) base = 4;
    else if (type.includes('Park')) base = 3;
    else if (type.includes('Cafe')) base = 2;

    const distBonus = Math.max(0, 5000 - distance) / 2500;
    return base + distBonus;
}

function clearMarkers() {
    markers.forEach(m => m.remove());
    markers = [];
    if (userMarker) { userMarker.remove(); userMarker = null; }
    document.getElementById('spotList').innerHTML = '';
}

function addMarker(position, title, color = '#3386c0') {
    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<div style="color:#0a0c1a;font-family:sans-serif;padding:4px;"><b>${title}</b></div>`
    );

    const marker = new mapboxgl.Marker({ color })
        .setLngLat([position.lng, position.lat])
        .setPopup(popup)
        .addTo(map);

    markers.push(marker);
    return marker;
}

function showStatus(msg, type) {
    const box = document.getElementById('statusBox');
    box.textContent = msg;
    box.className = 'status visible';
    box.style.background = type === 'warning' ? 'rgba(255,193,7,0.2)' : 'rgba(255,255,255,0.1)';
    box.style.color = type === 'warning' ? '#ffd54f' : '#fff';
}

async function findQuietSpots() {
    if (!userLocation) {
        showStatus('Waiting for location...', 'warning');
        return;
    }

    const btn = document.getElementById('quietBtn');
    btn.disabled = true;
    btn.textContent = 'Searching...';
    clearMarkers();
    addUserMarker(userLocation);
    showStatus('Querying OpenStreetMap for quiet places nearby...', 'success');

    const radius = 10000;
    const lat = userLocation.lat;
    const lng = userLocation.lng;

    const query = `
        [out:json][timeout:25];
        (
          node["leisure"="park"](around:${radius},${lat},${lng});
          way["leisure"="park"](around:${radius},${lat},${lng});
          node["amenity"="library"](around:${radius},${lat},${lng});
          way["amenity"="library"](around:${radius},${lat},${lng});
          node["amenity"="cafe"](around:${radius},${lat},${lng});
          way["amenity"="cafe"](around:${radius},${lat},${lng});
        );
        out center tags;
    `;

    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        if (!res.ok) throw new Error('Overpass API error');

        const data = await res.json();
        const elements = data.elements || [];

        if (elements.length === 0) {
            showStatus('No quiet spots found nearby. Try expanding your search area.', 'warning');
            btn.disabled = false;
            btn.textContent = '🔍 Find Quiet Spots';
            return;
        }

        let spots = [];

        elements.forEach(el => {
            let lat, lon;
            if (el.type === 'node') {
                lat = el.lat; lon = el.lon;
            } else if (el.center) {
                lat = el.center.lat; lon = el.center.lon;
            } else {
                return;
            }

            const type = getPlaceType(el.tags || {});
            const pos = { lat: lat, lng: lon };
            const dist = getDistance(userLocation, pos);
            const score = calculateQuietScore(type, dist);
            const name = el.tags?.name || 'Unnamed ' + type.split(' ')[0];

            spots.push({ name, type, pos, dist, score, element: el });
        });

        spots.sort((a, b) => b.score - a.score);
        spots = spots.slice(0, 15);

        const listEl = document.getElementById('spotList');

        spots.forEach((spot, index) => {
            const isBest = index === 0;
            const distKm = (spot.dist / 1000).toFixed(1);

            const markerColor = isBest ? '#00c853' : '#aa00ff';
            const marker = addMarker(spot.pos, `${spot.name} — ${spot.type}`, markerColor);

            const card = document.createElement('div');
            card.className = 'spot-card' + (isBest ? ' best' : '');
            card.innerHTML = `
                <div class="score">${spot.score.toFixed(1)}</div>
                <div class="name">${isBest ? '⭐ ' : ''}${spot.name}</div>
                <div class="meta">${spot.type} • ${distKm} km away</div>
            `;

            card.addEventListener('click', () => {
                map.flyTo({ center: [spot.pos.lng, spot.pos.lat], zoom: 16 });
                marker.togglePopup();
            });

            listEl.appendChild(card);
        });

        if (spots.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([userLocation.lng, userLocation.lat]);
            spots.forEach(s => bounds.extend([s.pos.lng, s.pos.lat]));
            map.fitBounds(bounds, { padding: 60 });
        }

        showStatus(`Found ${spots.length} quiet spots nearby!`, 'success');

    } catch (err) {
        console.error(err);
        showStatus('Error fetching data. Please try again later.', 'warning');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Find Quiet Spots';
    }
}

const resizeMap = ({ height, width }) => {
    const container = document.getElementById('map-wrapper-inner');
    container.style.width = width;
    container.style.height = height;
    requestAnimationFrame(() => map.resize());
};

const setActiveButton = (id) => {
    document.querySelector('.btn-control.active')?.classList.remove('active');
    document.getElementById(id).classList.add('active');
};

document.getElementById('narrow').addEventListener('click', () => {
    resizeMap({ width: '30%', height: '100%' });
    setActiveButton('narrow');
});

document.getElementById('full').addEventListener('click', () => {
    resizeMap({ width: '100%', height: '100%' });
    setActiveButton('full');
});

document.getElementById('wide').addEventListener('click', () => {
    resizeMap({ width: '100%', height: '50%' });
    setActiveButton('wide');
});

document.getElementById('quietBtn').addEventListener('click', findQuietSpots);

initializeMap();
