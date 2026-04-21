 let map = L.map('map').setView([40.7128, -74.0060], 13);
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
document.getElementById("quietBtn").addEventListener("click", () => {
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
    data.elements.forEach(place => {
      let marker = L.marker([place.lat, place.lon])
        .bindPopup(`🌿 Quiet Spot`)
        .addTo(map);

      markers.push(marker);
    });
  });
});

// Click to drop marker
map.on('click', function(e) {
  let marker = L.marker(e.latlng).addTo(map);
  markers.push(marker);
});
