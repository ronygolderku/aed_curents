// plankton.js
document.addEventListener('DOMContentLoaded', function() {
    // Ensure AWS SDK is available globally
    const { S3 } = AWS;

    // AWS credentials and endpoint URL
    const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
    const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
    const AWS_S3_ENDPOINT = process.env.AWS_S3_ENDPOINT
    const AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION

    // Initialize an S3 client
    const s3Client = new S3({
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        endpoint: AWS_S3_ENDPOINT,
        s3ForcePathStyle: true, // Set to true if your S3-compatible service requires path-style URLs
        region: AWS_DEFAULT_REGION
    });

    // Function to fetch an object from S3 and return its text content
    async function fetchObjectFromS3(key) {
        const bucketName = 'wamsi-westport-project-1-1';
        try {
            const params = {
                Bucket: bucketName,
                Key: key
            };
            const response = await s3Client.getObject(params).promise();
            return response.Body.toString('utf-8');
        } catch (error) {
            console.error("Error fetching object from S3:", error);
            return null;
        }
    }

    // Function to parse CSV data
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

    // Function to add plankton markers
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
                    });
                planktonLayer.addLayer(marker);
            } else {
                console.warn("Invalid latitude or longitude for point:", point);
            }
        });
        console.log("Plankton markers added");
        // planktonLayer.addTo(map);
        layerControl.addOverlay(planktonLayer, 'GHRSST SST');
        return planktonLayer;
    }

    // Function to fetch time series data for a point
    async function fetchTimeSeriesData(pointId) {
        const filePaths = [
            `csiem-data/data-lake/NASA/GHRSST/Points/2002-2023/GHRSST_sst_point_${pointId}.csv`,
            `csiem-data/data-lake/NASA/GHRSST/Points/ghrsst_sst_point_${pointId}.csv`
        ];
        const csvTexts = await Promise.all(filePaths.map(filePath => fetchObjectFromS3(filePath)));
        const data = csvTexts.filter(Boolean).flatMap(csvText => parseCSV(csvText, ','));

        if (data.length > 0) {
            plotTimeSeries(data, pointId);
        }
    }

    let chartInstance = null; // Variable to store chart instance

    // Function to plot time series data
    function plotTimeSeries(data, pointId) {
        const labels = data.map(row => new Date(row.time)); // Parse the date format "yyyy-mm-dd"
        const values = data.map(row => parseFloat(row.analysed_sst));

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
                    label: `GHRSST SST at Station ${pointId}`,
                    data: values,
                    borderColor: 'rgba(255, 0, 0, 1)',
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
                            text: 'Sea Surface Temperature [deg C]'
                        }
                    }
                }
            }
        });
    }

    // Fetch points.csv and add markers
    fetch('points.csv')
    .then(response => response.text())
    .then(csvText => {
        console.log("CSV Data fetched successfully");
        const data = parseCSV(csvText, ',');
        console.log("Parsed Data:", data);
        const planktonLayer = addPlanktonMarkers(data); // Get the planktonLayer
        map.on('overlayremove', function(e) {
            if (e.layer === planktonLayer) {
                document.getElementById('chart-container').style.display = 'none'; // Hide chart container when layer is removed
                if (chartInstance) {
                    chartInstance.destroy(); // Optionally, destroy the chart instance to clean up
                    chartInstance = null;
                }
            }
        });
    })
    .catch(error => console.error("Error fetching CSV data:", error));
});
