 let map = L.map('#map').setView([40.7128, -74.0060], 13);
let markers = [];

// Base map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

// Get user location
navigator.geolocation.getCurrentPosition(position => {
  const userLoc = [position.coords.latitude, position.coords.longitude];
  map.setView(userLoc, 13);

  L.marker(userLoc)
    .addTo(map)
    .bindPopup("📍 You are here")
    .openPopup();
});

// Clear markers
function clearMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
}



// 🌿 Quiet spots (parks, cafes, libraries)

document.getElementById("#quietBtn").addEventListener("click", () => {
  clearMarkers();

  let center = map.getCenter();

  let query = `
    [out:json];
    (
      node["leisure"="park"](around:1500,${center.lat},${center.lng});
      node["amenity"="library"](around:1500,${center.lat},${center.lng});
      node["amenity"="cafe"](around:1500,${center.lat},${center.lng});
    );
    out;
  `;

  fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query
  })
  .then(res => res.json())
  .then(data => {

    let bestSpot = null;
    let bestScore = -Infinity;

    data.elements.forEach(place => {
      let type = getPlaceType(place);
      let distance = map.distance(center, [place.lat, place.lon]);

      let score = calculateQuietScore(type, distance);

      let marker = L.marker([place.lat, place.lon])
        .bindPopup(`
          🌿 ${type} <br>
          Quiet Score: ${score.toFixed(2)}
        `)
        .addTo(map);

      markers.push(marker);

      if (score > bestScore) {
        bestScore = score;
        bestSpot = place;
      }
    });

    // ⭐ Highlight BEST quiet spot
    if (bestSpot) {
      let bestMarker = L.marker([bestSpot.lat, bestSpot.lon], {
        icon: L.icon({
          iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
        })
      })
      .bindPopup("⭐ BEST QUIET SPOT")
      .addTo(map);

      markers.push(bestMarker);
    }
  });
});

function getPlaceType(place) {
  if (place.tags.leisure === "park") return "Park 🌿";
  if (place.tags.amenity === "library") return "Library 📚";
  if (place.tags.amenity === "cafe") return "Cafe ☕";
  return "Place";
}

function calculateQuietScore(type, distance) {
  let baseScore = 0;

  if (type.includes("Library")) baseScore = 4;
  else if (type.includes("Park")) baseScore = 3;
  else if (type.includes("Cafe")) baseScore = 2;

  // closer = better
  let distanceScore = Math.max(0, 2000 - distance) / 1000;

  return baseScore + distanceScore;
}

