// plankton.js
document.addEventListener('DOMContentLoaded', function() {
    fetch('points.csv')
        .then(response => response.text())
        .then(csvText => {
            console.log("CSV Data fetched successfully");
            const data = parseCSV(csvText, ','); // Assuming points.csv is comma-separated
            console.log("Parsed Data:", data);
            addPlanktonMarkers(data);
        })
        .catch(error => console.error("Error fetching CSV data:", error));

    function parseCSV(csvText, delimiter) {
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        const headers = lines[0].split(delimiter).map(header => header.trim());
        return lines.slice(1).map(line => {
            const values = line.split(delimiter).map(value => value.trim());
            let obj = {};
            headers.forEach((header, index) => {
                if (values[index] !== undefined) {
                    obj[header] = values[index];
                }
            });
            return obj;
        });
    }

    function addPlanktonMarkers(data) {
        const planktonLayer = L.layerGroup();
        data.forEach(point => {
            const pointId = point['Points'];
            const latitude = parseFloat(point['latitude']);
            const longitude = parseFloat(point['longitude']);
            if (!isNaN(latitude) && !isNaN(longitude)) {
                console.log("Adding marker at:", latitude, longitude);
                const marker = L.marker([latitude, longitude])
                    .bindTooltip(`<b>Point No: ${pointId}</b><br>Latitude: ${latitude}<br>Longitude: ${longitude}`, {
                        permanent: false, // Tooltip will show on hover
                        direction: 'top'
                    }).on('click', () => {
                        fetchTimeSeriesData(pointId);
                        // After fetching data and before plotting, adjust the chart's position
                        positionChartNearMarker(marker); // Assuming marker has a method to get its position
                    });
                planktonLayer.addLayer(marker);
            } else {
                console.warn("Invalid latitude or longitude for point:", point);
            }
        });
        console.log("Plankton markers added");
        // planktonLayer.addTo(map);
        layerControl.addOverlay(planktonLayer, 'Chl-a');
    }

    function fetchTimeSeriesData(pointId) {
        const filePath = `data/sen/Points/CMEMS_OLCI_CHL_point_${pointId}.csv`; // Ensure this path is correct
        fetch(filePath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.text();
            })
            .then(csvText => {
                const data = parseCSV(csvText, ',');
                plotTimeSeries(data);
            })
            .catch(error => console.error("Error fetching time series data:", error));
    }

    let chartInstance = null; // Variable to store chart instance

    function plotTimeSeries(data) {
        const labels = data.map(row => new Date(row.time)); // Parse the date format "yyyy-mm-dd"
        const values = data.map(row => parseFloat(row.CHL));

        const ctx = document.getElementById('chart').getContext('2d');

        // Destroy existing chart instance if it exists
        if (chartInstance) {
            chartInstance.destroy();
        }

        // Make the chart container visible
        document.getElementById('chart-container').style.display = 'block';

        // Create new chart instance
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sentinel Chlorophyll-a (CHL)',
                    data: values,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'yyyy-MM-dd',
                            displayFormats: {
                                day: 'yyyy-MM-dd'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Chlorophyll (CHL)'
                        }
                    }
                }
            }
        });
    }
});
