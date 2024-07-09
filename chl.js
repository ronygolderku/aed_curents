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
        option.value = date;
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

    const dataset = document.getElementById('dataset').value;
    const variable = document.getElementById('variable').value;
    const date = document.getElementById('daterange').value;

    console.log("Fetching data from backend");

    try {
        const response = await fetch(`http://localhost:5000/fetch_netcdf?dataset=${dataset}&date=${date}&variable=${variable}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const ncData = await response.json();
        console.log("NetCDF data fetched successfully:", ncData);

        plotDataOnMap(ncData.latitudes, ncData.longitudes, ncData.data);
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

function plotDataOnMap(latitudes, longitudes, data) {
    console.log("Plotting data on map with latitudes, longitudes, and data:", { latitudes, longitudes, data });

    if (!latitudes.length || !longitudes.length || !data.length) {
        console.error("Invalid data for plotting");
        return;
    }

    const bounds = [[latitudes[0], longitudes[0]], [latitudes[latitudes.length - 1], longitudes[longitudes.length - 1]]];
    const canvasOverlay = L.imageOverlay(canvasRenderer(latitudes, longitudes, data), bounds).addTo(map);

    if (window.currentLayer) {
        map.removeLayer(window.currentLayer);
    }

    window.currentLayer = canvasOverlay;
    addColorBar();
}

function canvasRenderer(latitudes, longitudes, data) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const width = longitudes.length;
    const height = latitudes.length;
    canvas.width = width;
    canvas.height = height;

    const imageData = context.createImageData(width, height);
    const pixels = imageData.data;

    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            const value = data[0][i][j];
            if (!isNaN(value)) {
                const color = getColor(value);
                const index = (i * width + j) * 4;
                pixels[index] = color.r;
                pixels[index + 1] = color.g;
                pixels[index + 2] = color.b;
                pixels[index + 3] = 255; // Alpha channel
            }
        }
    }

    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}

function getColor(value) {
    const min = 0;
    const max = 1;
    const normalizedValue = (value - min) / (max - min);
    const hue = (1 - normalizedValue) * 240;
    const rgb = hslToRgb(hue / 360, 1, 0.5);
    return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = function(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function addColorBar() {
    const colorBarContainer = document.getElementById('colorbar');
    colorBarContainer.innerHTML = '';

    const colorBar = document.createElement('canvas');
    colorBar.width = 256;
    colorBar.height = 50;
    const context = colorBar.getContext('2d');

    for (let i = 0; i <= 256; i++) {
        const value = i / 256;
        const color = getColor(value);
        context.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        context.fillRect(i, 0, 1, 30);
    }

    context.fillStyle = "#000";
    context.font = "12px Arial";
    context.fillText("Min", 0, 40);
    context.fillText("Max", 230, 40);
    context.fillText("Value", 110, 40);

    const gradient = context.createLinearGradient(0, 0, 256, 0);
    for (let i = 0; i <= 256; i++) {
        const value = i / 256;
        const color = getColor(value);
        gradient.addColorStop(value, `rgb(${color.r}, ${color.g}, ${color.b})`);
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 30);

    colorBarContainer.appendChild(colorBar);
}
