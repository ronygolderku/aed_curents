function initDemoMap() {
    var Esri_DarkGreyCanvas = L.esri.basemapLayer('DarkGray');
    var Esri_WorldImagery = L.esri.basemapLayer('Imagery');
    var baseLayers = {
        "Grey Canvas": Esri_DarkGreyCanvas,
        "Satellite": Esri_WorldImagery,
    };
    var corner1 = L.latLng(-30, 110),
        corner2 = L.latLng(-35, 120),
        bounds = L.latLngBounds(corner1, corner2);

    var map = L.map('map', {
        layers: [Esri_DarkGreyCanvas],
        center: bounds.getCenter(),
        zoom: 9,
        minZoom: 3,
        maxZoom: 15,
        maxBounds: bounds,
        maxBoundsViscosity: 1
    });

    var layerControl = L.control.layers(baseLayers, null, { collapsed: false });
    layerControl.addTo(map);

    // Ensure the slider remains on top
    map.on('zoomend', function() {
        document.getElementById('time-slider-container').style.zIndex = 1000;
    });

    return {
        map: map,
        layerControl: layerControl
    };
}
var mapStuff = initDemoMap();
var map = mapStuff.map;
var layerControl = mapStuff.layerControl;

var times = [];
var dataCache = {};
var velocityLayer = null;

// Load all JSON files
for (let i = 1; i <= 13; i++) {
    $.getJSON(`data/wind${i}.json`, function (data) {
        const refTime = data[0].header.refTime;
        times.push(refTime);
        dataCache[refTime] = data;

        if (i === 13) {
                // Sort the times array
            times.sort(function(a, b) {
            return new Date(a) - new Date(b);
            });
            // Initialize time slider
            initTimeSlider();
            // Initialize the persistent velocity layer
            initVelocityLayer();
        }
    });
}

function initTimeSlider() {
    var timeSlider = $('#time-slider');
    var playButton = $('#play');
    var stopButton = $('#stop');
    var forwardButton = $('#forward');
    var backwardButton = $('#backward');
    var currentTime = $('#current-time');

    timeSlider.attr('max', times.length - 1);

    timeSlider.on('input', function () {
        var timeIndex = this.value;
        updateLayer(times[timeIndex]);
        currentTime.text(times[timeIndex]);
    });

    playButton.on('click', function () {
        playSlider();
    });

    stopButton.on('click', function () {
        stopSlider();
    });

    forwardButton.on('click', function () {
        moveSlider(1);
    });

    backwardButton.on('click', function () {
        moveSlider(-1);
    });

    // Initialize with the first time
    currentTime.text(times[0]);
}

function moveSlider(step) {
    var timeSlider = $('#time-slider');
    var newVal = +timeSlider.val() + step;
    if (newVal >= 0 && newVal < times.length) {
        timeSlider.val(newVal).trigger('input');
    }
}

function initVelocityLayer() {
    velocityLayer = L.velocityLayer({
        displayValues: true,
        displayOptions: {
            velocityType: 'Wind',
            displayPosition: 'bottomleft',
            displayEmptyString: 'No wind data'
        },
        data: dataCache[times[0]],
        maxVelocity: 10
    });
    layerControl.addOverlay(velocityLayer, 'Current');
    velocityLayer.addTo(map);
}

function updateLayer(time) {
    velocityLayer.setData(dataCache[time]);
}

var playInterval;
function playSlider() {
    var timeSlider = $('#time-slider');
    playInterval = setInterval(function () {
        if (timeSlider.val() < times.length - 1) {
            timeSlider.val(+timeSlider.val() + 1).trigger('input');
        } else {
            clearInterval(playInterval);
        }
    }, 1000);
}

function stopSlider() {
    clearInterval(playInterval);
}
