mapboxgl.accessToken = config.MAPBOX_API;


let map;
let markers = [];
let userLocation = null;
const DEFAULT_LOC = { lat: 40.7128, lng: -74.0060 }; // NYC fallback

// Initialize Google Map
function initMap() {


    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 13,
        center: DEFAULT_LOC,
        mapTypeId: "roadmap",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
    });

    
    // Try to get user's real location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
                map.setCenter(userLocation);
                addMarker(userLocation, "📍 You are here", "http://maps.google.com/mapfiles/ms/icons/blue-dot.png");
                showStatus("Location found! Click 'Find Quiet Spots' to search.", "success");
            },
            (err) => {
                console.warn("Geolocation denied/failed:", err);
                userLocation = DEFAULT_LOC;
                map.setCenter(DEFAULT_LOC);
                showStatus("Could not access your location. Using New York City as default.", "warning");
            }
        );
    } else {
        userLocation = DEFAULT_LOC;
        showStatus("Geolocation not supported. Using default location.", "warning");
    }
        
}

// Haversine distance in meters
function getDistance(coord1, coord2) {
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(coord2.lat - coord1.lat);
    const dLon = toRad(coord2.lng - coord1.lng);
    const a = Math.sin(dLat/2)**2 +
                Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
                Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getPlaceType(tags) {
    if (tags.leisure === "park") return "Park 🌿";
    if (tags.amenity === "library") return "Library 📚";
    if (tags.amenity === "cafe") return "Cafe ☕";
    return "Place";
}

function calculateQuietScore(type, distance) {
    let base = 0;
    if (type.includes("Library")) base = 4;
    else if (type.includes("Park")) base = 3;
    else if (type.includes("Cafe")) base = 2;

    // Proximity bonus: up to +2 points for being very close
    const distBonus = Math.max(0, 5000 - distance) / 2500;
    return base + distBonus;
}

function clearMarkers() {
    markers.forEach(m => m.setMap(null));
    markers = [];
    document.getElementById("spotList").innerHTML = "";
}

function addMarker(position, title, iconUrl = null) {
    const opts = {
        position: position,
        map: map,
        title: title,
        animation: google.maps.Animation.DROP
    };
    if (iconUrl) opts.icon = iconUrl;

    const marker = new google.maps.Marker(opts);
    
    const info = new google.maps.InfoWindow({
        content: `<div style="color:#0a0c1a;font-family:sans-serif;padding:4px;"><b>${title}</b></div>`
    });
    
    marker.addListener("click", () => info.open(map, marker));
    markers.push(marker);
    return marker;
}

function showStatus(msg, type) {
    const box = document.getElementById("statusBox");
    box.textContent = msg;
    box.className = "status visible";
    box.style.background = type === "warning" ? "rgba(255,193,7,0.2)" : "rgba(255,255,255,0.1)";
    box.style.color = type === "warning" ? "#ffd54f" : "#fff";
}

async function findQuietSpots() {
    if (!userLocation) {
        showStatus("Waiting for location...", "warning");
        return;
    }

    const btn = document.getElementById("quietBtn");
    btn.disabled = true;
    btn.textContent = "Searching...";
    clearMarkers();
    showStatus("Querying OpenStreetMap for quiet places nearby...", "success");

    // Re-add user marker
    addMarker(userLocation, "📍 You are here", "http://maps.google.com/mapfiles/ms/icons/blue-dot.png");

    const radius = 10000; // 10km
    const lat = userLocation.lat;
    const lng = userLocation.lng;

    // Overpass QL: search for parks, libraries, cafes around user
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
        const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query
        });

        if (!res.ok) throw new Error("Overpass API error");

        const data = await res.json();
        const elements = data.elements || [];

        if (elements.length === 0) {
            showStatus("No quiet spots found nearby. Try expanding your search area.", "warning");
            btn.disabled = false;
            btn.textContent = "🔍 Find Quiet Spots";
            return;
        }

        let spots = [];

        elements.forEach(el => {
            // Extract coordinates (nodes have lat/lon; ways/relations have center)
            let lat, lon;
            if (el.type === "node") {
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
            const name = el.tags?.name || "Unnamed " + type.split(" ")[0];

            spots.push({ name, type, pos, dist, score, element: el });
        });

        // Sort by score descending
        spots.sort((a, b) => b.score - a.score);

        // Take top 15 to avoid clutter
        spots = spots.slice(0, 15);

        const listEl = document.getElementById("spotList");

        spots.forEach((spot, index) => {
            const isBest = index === 0;
            const distKm = (spot.dist / 1000).toFixed(1);

            // Add map marker
            const markerColor = isBest 
                ? "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
                : "http://maps.google.com/mapfiles/ms/icons/purple-dot.png";
            
            const marker = addMarker(spot.pos, `${spot.name} — ${spot.type}`, markerColor);

            // Add to sidebar list
            const card = document.createElement("div");
            card.className = "spot-card" + (isBest ? " best" : "");
            card.innerHTML = `
                <div class="score">${spot.score.toFixed(1)}</div>
                <div class="name">${isBest ? "⭐ " : ""}${spot.name}</div>
                <div class="meta">${spot.type} • ${distKm} km away</div>
            `;
            
            card.addEventListener("click", () => {
                map.panTo(spot.pos);
                map.setZoom(16);
                google.maps.event.trigger(marker, "click");
            });
            
            listEl.appendChild(card);
        });

        // Fit bounds to show all markers
        if (spots.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(userLocation);
            spots.forEach(s => bounds.extend(s.pos));
            map.fitBounds(bounds, { padding: 60 });
        }

        showStatus(`Found ${spots.length} quiet spots nearby!`, "success");

    } catch (err) {
        console.error(err);
        showStatus("Error fetching data. Please try again later.", "warning");
    } finally {
        btn.disabled = false;
        btn.textContent = "🔍 Find Quiet Spots";
    }
}


initMap();