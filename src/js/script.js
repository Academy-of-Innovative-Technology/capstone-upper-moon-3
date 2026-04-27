mapboxgl.accessToken = "YOUR_MAPBOX_ACCESS_TOKEN";


let map = new mapboxgl.Map({
  container: 'map', // must match an ID
  style: 'mapbox://styles/mapbox/streets-v11',
  center: [-75.0, 43.0], // [lng, lat]
  zoom: 7
});




let markers = [];
function clearMarkers() {
  markers.forEach(m => m.remove());
  markers = [];
}


// Base map
L.titleLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);


// Get user location
navigator.geolocation.getCurrentPosition(position => {
  const userLoc = [position.coords.latitude, position.coords.longitude];
  map.setView(userLoc, 13);


   map.setCenter(userLoc);
  map.setZoom(13);


  new mapboxgl.Marker()
    .setLngLat(userLoc)
    .setPopup(new mapboxgl.Popup().setText("📍 You are here"))
    .addTo(map);
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
let distance = getDistance(
  [center.lng, center.lat],
  [place.lon, place.lat]
);


  // ✅ Restrict to NEW YORK STATE using area
  let query = `
    [out:json];
    area["name"="New York"]["boundary"="administrative"]->.searchArea;
    (
      node["leisure"="park"](area.searchArea);
      node["amenity"="library"](area.searchArea);
      node["amenity"="cafe"](area.searchArea);
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
      if (!place.lat || !place.lon) return;


      let type = getPlaceType(place);
      let distance = function getDistance(coord1, coord2) {
  const R = 6371000; // meters
  const toRad = x => x * Math.PI / 180;


  let dLat = toRad(coord2[1] - coord1[1]);
  let dLon = toRad(coord2[0] - coord1[0]);


  let a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(toRad(coord1[1])) * Math.cos(toRad(coord2[1])) *
          Math.sin(dLon/2) * Math.sin(dLon/2);


  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

  let score = calculateQuietScore(type, distance);


let marker = new mapboxgl.Marker()
  .setLngLat([place.lon, place.lat])
  .setPopup(
    new mapboxgl.Popup().setHTML(`
      🌿 ${type} <br>
      Quiet Score: ${score.toFixed(2)}
    `)
  )
  .addTo(map);


markers.push(marker);

  

      if (score > bestScore) {
        bestScore = score;
        bestSpot = place;
      }
    });


    // Highlight best
  if (bestSpot) {
  let bestMarker = new mapboxgl.Marker({ color: "green" })
    .setLngLat([bestSpot.lon, bestSpot.lat])
    .setPopup(new mapboxgl.Popup().setText("⭐ BEST QUIET SPOT"))
    .addTo(map);


  markers.push(bestMarker);

    }
  });
});


function getPlaceType(place) {
  if (place.tags?.leisure === "park") return "Park 🌿";
  if (place.tags?.amenity === "library") return "Library 📚";
  if (place.tags?.amenity === "cafe") return "Cafe ☕";
  return "Place";
}


function getPlaceType(place) {
  if (place.tags?.leisure === "park") return "Park 🌿";
  if (place.tags?.amenity === "library") return "Library 📚";
  if (place.tags?.amenity === "cafe") return "Cafe ☕";
  return "Place";
}


function calculateQuietScore(type, distance) {
  let baseScore = 0;


  if (type.includes("Library")) baseScore = 4;
  else if (type.includes("Park")) baseScore = 3;
  else if (type.includes("Cafe")) baseScore = 2;


  let distanceScore = Math.max(0, 20000 - distance) / 10000;


  return baseScore + distanceScore;
}



