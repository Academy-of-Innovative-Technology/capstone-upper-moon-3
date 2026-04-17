 let map;

    function initMap(location) {
      map = new google.maps.Map(document.getElementById("map"), {
        center: location,
        zoom: 14,
      });

      findQuietSpots(location);
    }

    function findQuietSpots(location) {
      const service = new google.maps.places.PlacesService(map);

      const types = ["park", "library", "cafe"];

      types.forEach(type => {
        const request = {
          location: location,
          radius: 1500,
          type: type
        };

        service.nearbySearch(request, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK) {
            results.forEach(place => {
              new google.maps.Marker({
                map: map,
                position: place.geometry.location,
                title: place.name
              });
            });
          }
        });
      });
    }

    function getLocation() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          initMap(userLocation);
        }, () => {
          initMap({ lat: 40.7128, lng: -74.0060 }); // fallback NYC
        });
      } else {
        initMap({ lat: 40.7128, lng: -74.0060 });
      }
    }

    window.onload = getLocation;