document.addEventListener('DOMContentLoaded', async function() {
    await initializeSelectors();
});
// // Add GeoJSON shapefile layer
//     fetch('/static/data/R_mask.geojson')
//     .then(response => response.json())
//     .then(data => {
//         const rMaskLayer = L.geoJSON(data, {
//             style: {
//                 color: 'grey',       // edgecolor
//                 fillColor: 'lightgrey', // facecolor
//                 weight: 1,
//                 fillOpacity: 0.2
//             }
//         });

//         // Add to layer control but NOT to map directly
//         layerControl.addOverlay(rMaskLayer, "Mask");
//     })
//     .catch(error => {
//         console.error("Error loading GeoJSON:", error);
//     });
    fetch('/static/data/R_mask.geojson')
    .then(res => res.json())
    .then(data => {
    // Log to debug
    console.log("Loaded mask data:", data);

    const worldBounds = [
      [-90, -180],
      [-90, 180],
      [90, 180],
      [90, -180],
      [-90, -180]
    ];

    const maskHoles = [];

    data.features.forEach(f => {
    if (!f.geometry || !f.geometry.coordinates) return;  // Skip null geometry

    const coords = f.geometry.coordinates;

    if (f.geometry.type === "Polygon") {
        maskHoles.push(...coords);
    } else if (f.geometry.type === "MultiPolygon") {
        coords.forEach(polygon => maskHoles.push(...polygon));
    }
    });

    const invertedMask = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          worldBounds,
          ...maskHoles
        ]
      }
    };

    const maskLayer = L.geoJSON(invertedMask, {
      style: {
        fillColor: 'grey',
        color: 'grey',
        fillOpacity: 1,
        weight: 0
      }
    });

    // Add to layer control but don't add immediately
    layerControl.addOverlay(maskLayer, "Bottom Mask");
  })
  .catch(err => console.error("Mask load error:", err));


    async function initializeSelectors() {
        try {
            const datasets = ['Sentinel_2', 'GHRSST'];
            const datasetSelect = document.getElementById('dataset');
            datasets.forEach(dataset => {
                const option = document.createElement('option');
                option.value = dataset;
                option.textContent = dataset;
                datasetSelect.appendChild(option);
            });

            updateSelectors();
        } catch (error) {
            console.error("Error initializing selectors:", error);
        }
    }

    async function updateSelectors() {
        const dataset = document.getElementById('dataset').value;
        // Use objects with value and label
        const variables = dataset === 'Sentinel_2'
            ? [
                { value: 'conc_chl', label: 'Chlorophyll-a' },
                { value: 'conc_tsm', label: 'Total Suspended Matter' },
                { value: 'cdom', label: 'CDOM' },
                { value: 'True_Color', label: 'True Color' }
            ]
            : [
                { value: 'analysed_sst', label: 'Sea Surface Temperature' }
            ];
        const variableSelect = document.getElementById('variable');
        variableSelect.innerHTML = '';

        variables.forEach(variable => {
            const option = document.createElement('option');
            option.value = variable.value;      // Use the actual variable name for value
            option.textContent = variable.label; // Use the label for display
            variableSelect.appendChild(option);
        });

        const dates = await fetchDatesForDataset(dataset);
        const dateSelect = document.getElementById('daterange');
        dateSelect.innerHTML = '';

        dates.forEach(date => {
            const option = document.createElement('option');
            option.value = date.replace(/\//g, ''); // Remove slashes from date
            option.textContent = date;
            dateSelect.appendChild(option);
        });
    }

// async function fetchDatesForDataset(dataset) {
//     const prefix = dataset === 'Sentinel_2' 
//         ? `csiem-data/data-lake/ESA/${dataset}/C2RCC/` 
//         : `csiem-data/data-lake/NASA/${dataset}/NC/`;

//     try {
//         const response = await fetch(`/list_dates?prefix=${prefix}`);
//         if (!response.ok) {
//             throw new Error(`HTTP error! status: ${response.status}`);
//         }
//         const dates = await response.json();
//         return dates;
//     } catch (error) {
//         console.error("Error fetching dates for dataset:", error);
//         return [];
//     }
// }
async function fetchDatesForDataset(dataset) {
    let prefix;
    if (dataset === 'Sentinel_2') {
        // Map sub-datasets to their respective paths
        const subDatasets = ['CHL', 'TSM', 'CDOM', 'True_Color'];
        prefix = subDatasets.map(sub => `csiem-data/data-lake/ESA/Sentinel_2/${sub}/`);
    } else {
        prefix = [`csiem-data/data-lake/NASA/${dataset}/NC/`];
    }

    try {
        // Fetch dates for each prefix (sub-dataset) if Sentinel_2
        const allDates = new Set();
        for (const p of prefix) {
            const response = await fetch(`/list_dates?prefix=${p}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const dates = await response.json();
            dates.forEach(date => allDates.add(date));
        }
        return Array.from(allDates).sort();
    } catch (error) {
        console.error("Error fetching dates for dataset:", error);
        return [];
    }
}

function updateUserSelection() {
    console.log("User selection updated");
}

async function updateMap(event) {
    if (event) {
        event.preventDefault();
    }
    map.spin(true, { lines: 8, length: 30, width: 13, radius: 20, scale: 0.5, color: 'white' });

    const dataset = document.getElementById('dataset').value;
    const variable = document.getElementById('variable').value;
    const date = document.getElementById('daterange').value;
    const messageElement = document.getElementById('message');

    console.log("Fetching data from backend");

    try {
        const response = await fetch(`/fetch_netcdf?dataset=${dataset}&date=${date}&variable=${variable}`);
        if (response.status === 204) {
            throw new Error('No data found for the selected variables within this region 😞');
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.message) {
            messageElement.textContent = result.message;
            return;
        }

        const url = `data:image/png;base64,${result.image}`;

        if (window.currentLayer) {
            map.removeLayer(window.currentLayer);
        }

        // const corner1 = L.latLng(-33, 114);
        // const corner2 = L.latLng(-31, 116);
        // const bounds = L.latLngBounds(corner1, corner2);
        const bounds = L.latLngBounds(
            [result.lat_min, result.lon_min],
            [result.lat_max, result.lon_max]
        );

        window.currentLayer = L.imageOverlay(url, bounds).addTo(map);
        map.fitBounds(bounds);

        const colorbarResponse = await fetch('/fetch_colorbar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ variable: variable, data_var: result.data_var })
        });

        if (!colorbarResponse.ok) {
            throw new Error(`HTTP error! status: ${colorbarResponse.status}`);
        }

        const colorbarBlob = await colorbarResponse.blob();
        const colorbarUrl = URL.createObjectURL(colorbarBlob);
        // Define the bounds for the colorbar overlay based on the variable type
        // Define colorbar bounds based on variable
        let colorbarBounds;
        if (variable === 'analysed_sst') {
            colorbarBounds = L.latLngBounds(
                [-31.01, 116],   // Top-left corner
                [-33.01, 116.5]  // Bottom-right corner
            );
        } else {
            colorbarBounds = L.latLngBounds(
                [-31.96, 115.85],     // Top-left corner
                [-32.30, 115.95]   // Bottom-right corner
            );
        }

        if (window.colorbarLayer) {
            map.removeLayer(window.colorbarLayer);
        }

        window.colorbarLayer = L.imageOverlay(colorbarUrl, colorbarBounds, { opacity: 1 }).addTo(map);

        messageElement.textContent = '';
        map.spin(false);
    } catch (error) {
        console.error("Error fetching data:", error);
        map.spin(false);
        messageElement.textContent = error.message || 'Error fetching data. Please try again.';
        if (window.currentLayer) {
            map.removeLayer(window.currentLayer);
            window.currentLayer = null;
        }
        if (window.colorbarLayer) {
            map.removeLayer(window.colorbarLayer);
            window.colorbarLayer = null;
        }
    }
}
