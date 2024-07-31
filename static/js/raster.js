document.addEventListener('DOMContentLoaded', async function() {
    await initializeSelectors();
});

async function initializeSelectors() {
    try {
        const datasets = ['Sentinel', 'GHRSST'];
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
    const variables = dataset === 'Sentinel' ? ['CHL'] : ['analysed_sst'];
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
    const prefix = dataset === 'Sentinel' 
        ? `csiem-data/data-lake/ESA/${dataset}/NC/`
        : `csiem-data/data-lake/NASA/${dataset}/NC/`;

    try {
        const response = await fetch(`/list_dates?prefix=${prefix}`);
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

        const corner1 = L.latLng(-33, 114);
        const corner2 = L.latLng(-31, 116);
        const bounds = L.latLngBounds(corner1, corner2);

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
        const colorbarCorner1 = L.latLng(-31.01, 116);
        const colorbarCorner2 = L.latLng(-33.01, 116.5);
        const colorbarBounds = L.latLngBounds(colorbarCorner1, colorbarCorner2);

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
