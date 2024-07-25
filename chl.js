document.addEventListener('DOMContentLoaded', async function() {
    await initializeSelectors();
});

async function initializeSelectors() {
    try {
        const datasets = ['Sentinel'];
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
    const variables = ['CHL'];
    const variableSelect = document.getElementById('variable');
    variableSelect.innerHTML = '';

    variables.forEach(variable => {
        const option = document.createElement('option');
        option.value = variable;
        option.textContent = variable;
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

async function fetchDatesForDataset(dataset) {
    const prefix = `csiem-data/data-lake/ESA/${dataset}/NC/`;
    try {
        const response = await fetch(`http://localhost:5000/list_dates?prefix=${prefix}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const dates = await response.json();
        return dates;
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
    // Start the spinner before loading data
    map.spin(true, { lines: 8, length: 30, width: 13, radius: 20, scale: 0.5, color: 'white' });

    const dataset = document.getElementById('dataset').value;
    const variable = document.getElementById('variable').value;
    const date = document.getElementById('daterange').value;
    const messageElement = document.getElementById('message'); // Assuming there's an element with id 'message' to show messages

    console.log("Fetching data from backend");

    try {
        // Fetch both the main image and the colorbar in parallel
        const [response, colorbarResponse] = await Promise.all([
            fetch(`http://localhost:5000/fetch_netcdf?dataset=${dataset}&date=${date}&variable=${variable}`),
            fetch(`http://localhost:5000/fetch_colorbar`)
        ]);

        if (response.status === 204) {
            throw new Error('No data found for the selected variables within this region 😞');
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        if (!colorbarResponse.ok) {
            throw new Error(`HTTP error! status: ${colorbarResponse.status}`);
        }

        // Process the main image
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (window.currentLayer) {
            map.removeLayer(window.currentLayer);
        }

        const corner1 = L.latLng(-33, 114);
        const corner2 = L.latLng(-31, 116);
        const bounds = L.latLngBounds(corner1, corner2);

        window.currentLayer = L.imageOverlay(url, bounds).addTo(map);
        map.fitBounds(bounds);

        // Process the colorbar image
        const colorbarBlob = await colorbarResponse.blob();
        const colorbarUrl = URL.createObjectURL(colorbarBlob);
        // Define bounds for the colorbar overlay. Adjust these coordinates to position the colorbar on your map.
        const colorbarCorner1 = L.latLng(-31.01, 116); // Example coordinates, adjust as needed
        const colorbarCorner2 = L.latLng(-33.01, 116.5); // Example coordinates, adjust as needed
        const colorbarBounds = L.latLngBounds(colorbarCorner1, colorbarCorner2);

        // Check if there's an existing colorbar layer and remove it
        if (window.colorbarLayer) {
            map.removeLayer(window.colorbarLayer);
        }

        // Create a new colorbar overlay and add it to the map
        window.colorbarLayer = L.imageOverlay(colorbarUrl, colorbarBounds, {opacity: 1}).addTo(map);

        // Clear any previous messages
        messageElement.textContent = '';

        // Stop the spinner after all data has been loaded and processed
        map.spin(false);
    } catch (error) {
        console.error("Error fetching data:", error);
        // Ensure the spinner is stopped even if there's an error
        map.spin(false);
        messageElement.textContent = error.message || 'Error fetching data. Please try again.';
        // Remove any existing layers
        if (window.currentLayer) {
            map.removeLayer(window.currentLayer);
            window.currentLayer = null;
        }
        // Remove any existing colorbar
        if (window.colorbarLayer) {
            map.removeLayer(window.colorbarLayer);
            window.colorbarLayer = null; // Reset the colorbar layer
        }
    }
}