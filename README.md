# aed_curents

`aed_curents` is a web application that extracts netCDF data and visualises it on a web map.

Live demo: https://ronygolderku.github.io/aed_curents/


## Using the app

The app provides users with an interactive Leaflet web map with Current data overlays.

The overlays and basemaps can be toggled from a control panel in the top right.


## Building and launching

Clone the `aed_curents` repository <br>
```
git clone https://github.com/ronygolderku/aed_curents.git

```
The app must be run on a web server. For example, using [http-server](https://www.npmjs.com/package/http-server):  
```
http-server
```
And then in your browser go to:
```
http://127.0.0.1:8080
```

## Map configuration

The Leaflet map can be modified in `netcdf-vis.js`. Modifications to the Leaflet plugins can be made in the `src` and `dist` directories.

## Distribution

The demo app can be embedded into another webpage as an iframe:

``<iframe src="https://ronygolderku.github.io/aed_curents/" width="600" height="400"></iframe>``

A custom version of the app could be embedded in a similar way.

## References

This project relies on:
* [netCDF4](http://unidata.github.io/netcdf4-python/)
* [leaflet-velocity](https://github.com/danwild/leaflet-velocity)
* [Leaflet.idw](https://github.com/JoranBeaufort/Leaflet.idw)

Which themselves rely on:
* [L.CanvasOverlay.js](https://gist.github.com/Sumbera/11114288)
* [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat)
* [earth](https://github.com/cambecc/earth)

## Further work
* Add instructions
* Create user interface for netCDF extraction
* Automate server side Python data processing from web app
* Integrate [netCDF conventions](https://www.unidata.ucar.edu/software/netcdf/conventions.html)
* Support time dimension
* Support data streaming
* Explore other temperature visualisation options
