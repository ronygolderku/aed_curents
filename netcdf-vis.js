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
    // Add mini map
    var miniMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    var miniMap = new L.Control.MiniMap(miniMapLayer, {
      toggleDisplay: true,
      minimized: false
    }).addTo(map);
    // Ensure the slider remains on top
    map.on('zoomend', function() {
        document.getElementById('time-slider-container').style.zIndex = 1000;
    });
    L.control.scale().addTo(map);
    L.control.fullscreen().addTo(map);
    L.control.mousePosition().addTo(map)
    
    // Add search control
    // var searchControl = new L.Control.Search({
    // layer: baseLayers["Feature Layer"], // Ensure this is a feature layer
    // propertyName: 'name', // Adjust based on your feature property
    // initial: false,
    // zoom: 12,
    // marker: false
    // });
    //map.addControl(searchControl);
    var search = new GeoSearch.GeoSearchControl({
        provider: new GeoSearch.OpenStreetMapProvider(),
      });

    map.addControl(search);
        // Add draw control
    var drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    var drawControl = new L.Control.Draw({
        edit: {
        featureGroup: drawnItems
        }
    });
    map.addControl(drawControl);
    map.on('draw:created', function (e) {
        var type = e.layerType,
            layer = e.layer;
        drawnItems.addLayer(layer);
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
            // Sort times chronologically after all files are loaded
            times.sort((a, b) => new Date(a) - new Date(b));
            // Initialize time slider
            initTimeSlider();
            // Initialize the persistent velocity layer
            initVelocityLayer();
        }
    });
}

function initTimeSlider() {
    var timeSlider = $('#time-slider');
    var playPauseButton = $('#play-pause');
    var forwardButton = $('#forward');
    var backwardButton = $('#backward');
    var currentTime = $('#current-time');

    timeSlider.attr('max', times.length - 1);

    timeSlider.on('input', function () {
        var timeIndex = this.value;
        updateLayer(times[timeIndex]);
        currentTime.text(times[timeIndex]);
    });

    playPauseButton.on('click', function () {
        if (playPauseButton.hasClass('fa-play')) {
            playSlider();
            playPauseButton.removeClass('fa-play').addClass('fa-pause').attr('title', 'Pause');
        } else {
            stopSlider();
            playPauseButton.removeClass('fa-pause').addClass('fa-play').attr('title', 'Play');
        }
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
            stopSlider();
        }
    }, 1000);
}

function stopSlider() {
    clearInterval(playInterval);
    $('#play-pause').removeClass('fa-pause').addClass('fa-play').attr('title', 'Play');
}