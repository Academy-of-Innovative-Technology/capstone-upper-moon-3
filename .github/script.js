let button = document.getElementById("click");
let map = L.map('map').setView([51.505, -0.09], 13);
let markers = [];

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

if (button) {
  button.addEventListener("click", function(){
    let xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        let data = JSON.parse(this.responseText);
      
        markers.forEach(marker => marker.remove());
        markers = [];
        
      
        data.items.forEach(station => {
          if (station.lat && station.long) {
            let marker = L.marker([station.lat, station.long])
              .bindPopup(`Station: ${station.label}`)
              .addTo(map);
            markers.push(marker);
          }
        });
      }
    };
    xhttp.open("GET", "https://environment.data.gov.uk/flood-monitoring/id/stations?parameter=level&parameter=rainfall&_limit=5000", true);
    xhttp.send();
  });
}

function getLocation() {
  navigator.geolocation.getCurrentPosition(function(position) {
    let userLocation = [
      position.coords.latitude,
      position.coords.longitude
    ];
    
    map.setView(userLocation, 13);
    L.marker(userLocation).addTo(map);
  });
}

getLocation();

map.on('click', function(e) {
  L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
});


