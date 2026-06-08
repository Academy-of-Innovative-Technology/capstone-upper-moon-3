/* ============================================
   QUIET SPOT FINDER — MAP PAGE LOGIC
   ============================================ */

const MapApp = {
    map: null,
    markers: [],
    userMarker: null,
    userLocation: null,
    libraryData: [],
    currentMode: 'libraries',
    currentBorough: 'all',
    pendingSaveCoords: null,

    DEFAULT_BOUNDS: [
        [-74.2709, 40.48972],
        [-73.7042, 40.93288]
    ],
    DEFAULT_LOC: { lat: 40.7128, lng: -74.0060 },

    BOROUGH_NAMES: { '1': 'Manhattan', '2': 'Bronx', '3': 'Brooklyn', '4': 'Queens', '5': 'Staten Island' },

    SYSTEM_COLORS: {
        NYPL: '#4ecdc4',
        BPL: '#ffe66d',
        QPL: '#a8e6cf'
    },

    async init() {
        await this.loadLibraryData();
        this.initializeMap();
        this.setupUI();
        this.setupTabs();
        this.renderSavedList();
        this.checkUrlParams();

        App.on('spotsChanged', () => {
            this.renderSavedList();
        });
    },

    async loadLibraryData() {
        try {
            const res = await fetch('data/libraries.json');
            this.libraryData = await res.json();
        } catch (err) {
            console.error('Failed to load library data:', err);
            App.showToast('Could not load library data', 'error');
        }
    },

    initializeMap() {
        mapboxgl.accessToken = config.MAPBOX_API;

        this.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [this.DEFAULT_LOC.lng, this.DEFAULT_LOC.lat],
            zoom: 11,
            maxBounds: this.DEFAULT_BOUNDS
        });

        this.map.on('load', () => {
            this.addBoundsLayer();
            this.addLibraryMarkers();
            this.tryGeolocation();

            this.map.on('click', (e) => {
                this.handleMapClick(e);
            });

            setTimeout(() => {
                const hint = document.getElementById('mapHint');
                if (hint) hint.classList.add('fade');
            }, 5000);
        });
    },

    addBoundsLayer() {
        this.map.addSource('bounds', {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [this.DEFAULT_BOUNDS[0][0], this.DEFAULT_BOUNDS[0][1]],
                        [this.DEFAULT_BOUNDS[0][0], this.DEFAULT_BOUNDS[1][1]],
                        [this.DEFAULT_BOUNDS[1][0], this.DEFAULT_BOUNDS[1][1]],
                        [this.DEFAULT_BOUNDS[1][0], this.DEFAULT_BOUNDS[0][1]],
                        [this.DEFAULT_BOUNDS[0][0], this.DEFAULT_BOUNDS[0][1]]
                    ]]
                }
            }
        });

        this.map.addLayer({
            id: 'line-bounding-box',
            type: 'line',
            source: 'bounds',
            paint: {
                'line-color': '#3386c0',
                'line-width': 2,
                'line-opacity': 0.6,
                'line-dasharray': [4, 4]
            }
        });
    },

    addLibraryMarkers() {
        this.clearMarkers();
        const listEl = document.getElementById('spotList');
        if (listEl) listEl.innerHTML = '';

        let filtered = this.libraryData;
        if (this.currentBorough !== 'all') {
            filtered = filtered.filter(l => String(l.borocode) === this.currentBorough);
        }

        if (filtered.length === 0) {
            this.showStatus('No libraries found for this filter.', 'warning');
            return;
        }

        const bounds = new mapboxgl.LngLatBounds();

        filtered.forEach(lib => {
            const coords = lib.the_geom?.coordinates;
            if (!coords) return;
            const [lng, lat] = coords;
     const color = this.SYSTEM_COLORS[lib.system] || '#b698fb';

            const el = document.createElement('div');
            el.className = 'custom-marker';
            el.innerHTML = '📚';
            el.style.fontSize = '22px';
            el.style.cursor = 'pointer';
            el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))';

            const popup = new mapboxgl.Popup({ offset: 20 }).setHTML(
                `<div style="font-family:'Atkinson Hyperlegible',sans-serif;padding:4px;">
                    <b style="font-size:15px;color:#0a0c1a;">${this.escapeHtml(lib.name)}</b><br>
                    <span style="font-size:12px;color:#666;">${this.escapeHtml(lib.system)} • ${this.escapeHtml(lib.city)}</span>
                </div>`
            );

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([lng, lat])
                .setPopup(popup)
                .addTo(this.map);

            marker._libData = lib;
            marker.getElement().addEventListener('click', () => {
                this.showLibraryDetail(lib);
            });

            this.markers.push(marker);
            bounds.extend([lng, lat]);
        });

        if (!bounds.isEmpty()) {
            this.map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
        }

        this.showStatus(`Showing ${filtered.length} libraries${this.currentBorough !== 'all' ? ' in ' + this.BOROUGH_NAMES[this.currentBorough] : ''}`, 'success');
        this.renderLibraryList(filtered);
    },

    renderLibraryList(libraries) {
        const listEl = document.getElementById('spotList');
        if (!listEl) return;
        listEl.innerHTML = '';

        libraries.slice(0, 20).forEach(lib => {
            const coords = lib.the_geom?.coordinates;
            if (!coords) return;
            const [lng, lat] = coords;
            const card = document.createElement('div');
            card.className = 'spot-card';
            const sysColor = this.SYSTEM_COLORS[lib.system] || '#b698fb';
            card.style.borderLeftColor = sysColor;
            card.innerHTML = `
                <div class="name">${this.escapeHtml(lib.name)}</div>
                <div class="meta">${this.escapeHtml(lib.system)} • ${this.escapeHtml(lib.city)} • ${this.escapeHtml(lib.streetname || '')}</div>
                <div class="spot-actions">
                    <button class="btn-small btn-primary" onclick="MapApp.saveLibrary('${lib.name.replace(/'/g, "\\'")}')">⭐ Save</button>
                    <button class="btn-small btn-secondary" onclick="MapApp.flyToLibrary('${lib.name.replace(/'/g, "\\'")}')">View</button>
                </div>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                this.flyToLibrary(lib.name);
            });
            listEl.appendChild(card);
        });
    },

    flyToLibrary(name) {
        const lib = this.libraryData.find(l => l.name === name);
        if (!lib || !lib.the_geom?.coordinates) return;
        const [lng, lat] = lib.the_geom.coordinates;
        this.map.flyTo({ center: [lng, lat], zoom: 16 });
        const marker = this.markers.find(m => m._libData?.name === name);
        if (marker) marker.togglePopup();
    },

    saveLibrary(name) {
        const lib = this.libraryData.find(l => l.name === name);
        if (!lib) return;
        const coords = lib.the_geom?.coordinates;
        App.saveSpot({
            id: lib.name + '_' + lib.system,
            name: lib.name,
            type: 'Library (' + lib.system + ')',
            city: lib.city,
            lat: coords ? coords[1] : 0,
            lng: coords ? coords[0] : 0,
            system: lib.system,
            url: lib.url
        });
    },

    showLibraryDetail(lib) {
        const modal = document.getElementById('detailModal');
        const content = document.getElementById('detailContent');
        if (!modal || !content) return;

        const coords = lib.the_geom?.coordinates;
        const lat = coords ? coords[1] : '';
        const lng = coords ? coords[0] : '';
        const sysColor = this.SYSTEM_COLORS[lib.system] || '#b698fb';

        content.innerHTML = `
            <div class="detail-header">
                <div class="detail-icon">📚</div>
                <div class="detail-title">
                    <h2>${this.escapeHtml(lib.name)}</h2>
                    <span class="detail-type" style="color:${sysColor}">${lib.system} Library</span>
                </div>
            </div>
            <div class="detail-body">
                <div class="detail-row">
                    <span class="detail-label">Address</span>
                    <span class="detail-value">${this.escapeHtml(lib.housenum || '')} ${this.escapeHtml(lib.streetname || '')}, ${this.escapeHtml(lib.city)}, NY ${lib.zip}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Borough</span>
                    <span class="detail-value">${this.BOROUGH_NAMES[lib.borocode] || 'NYC'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Website</span>
                    <span class="detail-value"><a href="${lib.url}" target="_blank">${this.escapeHtml(lib.url)}</a></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Coords</span>
                    <span class="detail-value">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
                </div>
            </div>
            <div class="detail-actions">
                <button class="btn-primary" onclick="MapApp.saveLibrary('${lib.name.replace(/'/g, "\\'")}'); document.getElementById('detailModal').classList.add('hidden');">⭐ Save This Spot</button>
                <a href="${lib.url}" target="_blank" class="btn-secondary">Visit Website →</a>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    handleMapClick(e) {
        const { lng, lat } = e.lngLat;
        this.pendingSaveCoords = { lat, lng };

        const modal = document.getElementById('saveModal');
        const coordsEl = document.getElementById('saveModalCoords');
        const input = document.getElementById('saveSpotName');

        if (modal && coordsEl) {
            coordsEl.textContent = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
            input.value = '';
            modal.classList.remove('hidden');
        }
    },

    confirmSaveCustom() {
        const input = document.getElementById('saveSpotName');
        const name = input.value.trim() || 'Custom Spot';
        if (!this.pendingSaveCoords) return;

        App.saveSpot({
            id: 'custom_' + Date.now(),
            name: name,
            type: 'Custom Pin',
            city: 'NYC',
            lat: this.pendingSaveCoords.lat,
            lng: this.pendingSaveCoords.lng
        });

        document.getElementById('saveModal').classList.add('hidden');
        this.pendingSaveCoords = null;
    },

    tryGeolocation() {
        if (!navigator.geolocation) {
            this.userLocation = this.DEFAULT_LOC;
            this.showStatus('Geolocation not supported. Using default location.', 'warning');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                this.userLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
                this.map.flyTo({ center: [this.userLocation.lng, this.userLocation.lat], zoom: 13 });
                this.addUserMarker(this.userLocation);
                this.showStatus("Location found! Explore libraries or click 'Find Quiet Spots' for parks & cafes.", 'success');
            },
            (err) => {
                console.warn('Geolocation denied:', err);
                this.userLocation = this.DEFAULT_LOC;
                this.showStatus('Could not access your location. Using default.', 'warning');
            }
        );
    },

    addUserMarker(position) {
        if (this.userMarker) this.userMarker.remove();
        const el = document.createElement('div');
        el.innerHTML = '📍';
        el.style.fontSize = '28px';
        el.style.cursor = 'pointer';
        el.style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))';
        this.userMarker = new mapboxgl.Marker({ element: el })
            .setLngLat([position.lng, position.lat])
            .setPopup(new mapboxgl.Popup().setHTML('<b>You are here</b>'))
            .addTo(this.map);
    },

    clearMarkers() {
        this.markers.forEach(m => m.remove());
        this.markers = [];
    },

    showStatus(msg, type) {
        const box = document.getElementById('statusBox');
        if (!box) return;
        box.textContent = msg;
        box.className = 'status visible ' + type;
    },

    async findQuietSpots() {
        if (!this.userLocation) {
            this.showStatus('Waiting for location...', 'warning');
            return;
        }

        const btn = document.getElementById('quietBtn');
        btn.disabled = true;
        btn.textContent = 'Searching...';
        this.clearMarkers();
        if (this.userMarker) this.userMarker.remove();
        this.addUserMarker(this.userLocation);
        this.showStatus('Querying OpenStreetMap for quiet places nearby...', 'success');

        const radius = 10000;
        const lat = this.userLocation.lat;
        const lng = this.userLocation.lng;

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
                this.showStatus('No quiet spots found nearby. Try expanding your search area.', 'warning');
                btn.disabled = false;
                btn.textContent = '🔍 Find Quiet Spots';
                return;
            }

            let spots = [];
            elements.forEach(el => {
                let lat, lon;
                if (el.type === 'node') { lat = el.lat; lon = el.lon; }
                else if (el.center) { lat = el.center.lat; lon = el.center.lon; }
                else return;

                const type = this.getPlaceType(el.tags || {});
                const pos = { lat, lng: lon };
                const dist = this.getDistance(this.userLocation, pos);
                const score = this.calculateQuietScore(type, dist);
                const name = el.tags?.name || 'Unnamed ' + type.split(' ')[0];
                spots.push({ name, type, pos, dist, score, element: el });
            });

            spots.sort((a, b) => b.score - a.score);
            spots = spots.slice(0, 15);

            const listEl = document.getElementById('spotList');
            listEl.innerHTML = '';

            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([this.userLocation.lng, this.userLocation.lat]);

            spots.forEach((spot, index) => {
                const isBest = index === 0;
                const distKm = (spot.dist / 1000).toFixed(1);
                const markerColor = isBest ? '#00ff88' : '#aa00ff';

                const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
                    `<div style="font-family:'Atkinson Hyperlegible',sans-serif;padding:4px;">
                        <b style="font-size:15px;color:#0a0c1a;">${this.escapeHtml(spot.name)}</b><br>
                        <span style="font-size:12px;color:#666;">${spot.type} • ${distKm} km</span>
                    </div>`
                );

                const marker = new mapboxgl.Marker({ color: markerColor })
                    .setLngLat([spot.pos.lng, spot.pos.lat])
                    .setPopup(popup)
                    .addTo(this.map);

                this.markers.push(marker);
                bounds.extend([spot.pos.lng, spot.pos.lat]);

                const card = document.createElement('div');
                card.className = 'spot-card' + (isBest ? ' best' : '');
                card.innerHTML = `
                    <div class="score">${spot.score.toFixed(1)}</div>
                    <div class="name">${isBest ? '⭐ ' : ''}${this.escapeHtml(spot.name)}</div>
                    <div class="meta">${spot.type} • ${distKm} km away</div>
                    <div class="spot-actions">
                        <button class="btn-small btn-primary" onclick="MapApp.saveQuietSpot('${spot.name.replace(/'/g, "\\'")}', ${spot.pos.lat}, ${spot.pos.lng}, '${spot.type}')">⭐ Save</button>
                    </div>
                `;
                card.addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON') return;
                    this.map.flyTo({ center: [spot.pos.lng, spot.pos.lat], zoom: 16 });
                    marker.togglePopup();
                });
                listEl.appendChild(card);
            });

            this.map.fitBounds(bounds, { padding: 60 });
            this.showStatus(`Found ${spots.length} quiet spots nearby!`, 'success');

        } catch (err) {
            console.error(err);
            this.showStatus('Error fetching data. Please try again later.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '🔍 Find Quiet Spots';
        }
    },

    saveQuietSpot(name, lat, lng, type) {
        App.saveSpot({
            id: 'quiet_' + name + '_' + Date.now(),
            name: name,
            type: type,
            city: 'NYC',
            lat: lat,
            lng: lng
        });
    },

    getPlaceType(tags) {
        if (tags.leisure === 'park') return 'Park 🌿';
        if (tags.amenity === 'library') return 'Library 📚';
        if (tags.amenity === 'cafe') return 'Cafe ☕';
        return 'Place';
    },

    calculateQuietScore(type, distance) {
        let base = 0;
        if (type.includes('Library')) base = 4;
        else if (type.includes('Park')) base = 3;
        else if (type.includes('Cafe')) base = 2;
        const distBonus = Math.max(0, 5000 - distance) / 2500;
        return base + distBonus;
    },

    getDistance(coord1, coord2) {
        const R = 6371000;
        const toRad = x => x * Math.PI / 180;
        const dLat = toRad(coord2.lat - coord1.lat);
        const dLon = toRad(coord2.lng - coord1.lng);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    setupUI() {
        const resizeMap = ({ height, width }) => {
            const container = document.getElementById('map-wrapper-inner');
            container.style.width = width;
            container.style.height = height;
            requestAnimationFrame(() => this.map.resize());
        };

        const setActive = (id) => {
            document.querySelector('.btn-control.active')?.classList.remove('active');
            document.getElementById(id)?.classList.add('active');
        };

        document.getElementById('narrow')?.addEventListener('click', () => {
            resizeMap({ width: '30%', height: '100%' });
            setActive('narrow');
        });
        document.getElementById('full')?.addEventListener('click', () => {
            resizeMap({ width: '100%', height: '100%' });
            setActive('full');
        });
        document.getElementById('wide')?.addEventListener('click', () => {
            resizeMap({ width: '100%', height: '50%' });
            setActive('wide');
        });

        document.getElementById('quietBtn')?.addEventListener('click', () => this.findQuietSpots());

        document.getElementById('locateBtn')?.addEventListener('click', () => {
            this.tryGeolocation();
        });

        document.getElementById('searchBtn')?.addEventListener('click', () => this.handleSearch());
        document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentBorough = chip.dataset.borough;
                if (this.currentMode === 'libraries') {
                    this.addLibraryMarkers();
                }
            });
        });

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentMode = btn.dataset.mode;
                if (this.currentMode === 'libraries') {
                    this.addLibraryMarkers();
                } else {
                    this.clearMarkers();
                    document.getElementById('spotList').innerHTML = '';
                    this.showStatus('Click "Find Quiet Spots" to search for parks, libraries, and cafes near you.', 'info');
                }
            });
        });

        document.getElementById('cancelSave')?.addEventListener('click', () => {
            document.getElementById('saveModal').classList.add('hidden');
            this.pendingSaveCoords = null;
        });

        document.getElementById('confirmSave')?.addEventListener('click', () => {
            this.confirmSaveCustom();
        });

        document.getElementById('closeDetail')?.addEventListener('click', () => {
            document.getElementById('detailModal').classList.add('hidden');
        });

        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.add('hidden');
            });
        });
    },

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
                if (btn.dataset.tab === 'saved') {
                    this.renderSavedList();
                }
            });
        });
    },

    renderSavedList() {
        const list = document.getElementById('savedList');
        if (!list) return;
        const spots = App.getSavedSpots();

        if (spots.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📌</div>
                    <p>No saved spots yet. Click any marker and hit "Save" to add it.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = '';
        spots.forEach(spot => {
            const item = document.createElement('div');
            item.className = 'saved-item';
            item.innerHTML = `
                <div class="saved-info">
                    <h4>${this.escapeHtml(spot.name)}</h4>
                    <p>${this.escapeHtml(spot.type)} • ${this.escapeHtml(spot.city || 'NYC')}</p>
                </div>
                <div style="display:flex;gap:6px;">
                    <a href="map.html?lat=${spot.lat}&lng=${spot.lng}&zoom=16" class="btn-small btn-secondary">View</a>
                    <button class="saved-remove" onclick="MapApp.removeSavedSpot('${spot.id}')">×</button>
                </div>
            `;
            list.appendChild(item);
        });
    },

    removeSavedSpot(id) {
        App.removeSpot(id);
        this.renderSavedList();
    },

    handleSearch() {
        const query = document.getElementById('searchInput').value.trim().toLowerCase();
        if (!query) {
            this.addLibraryMarkers();
            return;
        }
        const filtered = this.libraryData.filter(l =>
            l.name.toLowerCase().includes(query) ||
            (l.streetname && l.streetname.toLowerCase().includes(query)) ||
            (l.city && l.city.toLowerCase().includes(query))
        );
        this.clearMarkers();
        const listEl = document.getElementById('spotList');
        listEl.innerHTML = '';

        if (filtered.length === 0) {
            this.showStatus('No libraries match your search.', 'warning');
            return;
        }

        const bounds = new mapboxgl.LngLatBounds();
        filtered.forEach(lib => {
            const coords = lib.the_geom?.coordinates;
            if (!coords) return;
            const color = this.SYSTEM_COLORS[lib.system] || '#b698fb';
            const popup = new mapboxgl.Popup({ offset: 20 }).setHTML(
                `<div style="font-family:'Atkinson Hyperlegible',sans-serif;padding:4px;">
                    <b style="font-size:15px;color:#0a0c1a;">${this.escapeHtml(lib.name)}</b><br>
                    <span style="font-size:12px;color:#666;">${this.escapeHtml(lib.system)} • ${this.escapeHtml(lib.city)}</span>
                </div>`
            );
            const marker = new mapboxgl.Marker({ color })
                .setLngLat([coords[0], coords[1]])
                .setPopup(popup)
                .addTo(this.map);
            this.markers.push(marker);
            bounds.extend([coords[0], coords[1]]);
        });

        if (!bounds.isEmpty()) this.map.fitBounds(bounds, { padding: 60 });
        this.showStatus(`Found ${filtered.length} matching libraries`, 'success');
        this.renderLibraryList(filtered);
    },

    checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const borough = params.get('borough');
        const lat = params.get('lat');
        const lng = params.get('lng');
        const zoom = params.get('zoom');

        if (borough) {
            this.currentBorough = borough;
            document.querySelectorAll('.chip').forEach(c => {
                c.classList.toggle('active', c.dataset.borough === borough);
            });
            this.addLibraryMarkers();
        }

        if (lat && lng) {
            this.map.flyTo({
                center: [parseFloat(lng), parseFloat(lat)],
                zoom: parseFloat(zoom) || 16
            });
        }
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

