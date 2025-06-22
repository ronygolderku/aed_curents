from flask import Flask, jsonify, request, send_file, render_template
from flask_cors import CORS
import boto3
import os
from dotenv import load_dotenv
import numpy as np
import base64
import xarray as xr
import matplotlib
matplotlib.use('Agg')
from matplotlib.colors import LogNorm, Normalize
from matplotlib.ticker import FuncFormatter, NullLocator
import matplotlib.colors as colors
import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
from io import BytesIO
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from contextlib import closing
import cmocean  # Ensure cmocean is installed for colormaps
import cmocean
from PIL import Image
import rasterio
from rasterio.warp import transform_bounds
import re
import botocore
app = Flask(__name__)  # Initialize Flask app
CORS(app)  # Enable CORS for all routes

# Load environment variables
load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_S3_ENDPOINT = os.getenv('AWS_S3_ENDPOINT')
AWS_DEFAULT_REGION = os.getenv('AWS_DEFAULT_REGION')

# Initialize S3 client
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    endpoint_url=AWS_S3_ENDPOINT,
    region_name=AWS_DEFAULT_REGION
)
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/list_dates', methods=['GET'])
def list_dates():
    prefix = request.args.get('prefix')
    dates = set()
    continuation_token = None

    try:
        while True:
            if continuation_token:
                response = s3_client.list_objects_v2(Bucket='wamsi-westport-project-1-1', Prefix=prefix, ContinuationToken=continuation_token)
            else:
                response = s3_client.list_objects_v2(Bucket='wamsi-westport-project-1-1', Prefix=prefix)

            for item in response.get('Contents', []):
                key = item['Key']
                filename = key.split('/')[-1]

                # Handle PNG filenames for Sentinel-2 (CHL, TSM, CDOM)
                if filename.endswith(".png"):
                    date_match = re.match(r"(\d{8})\.png", filename)
                    if date_match:
                        date_str = date_match.group(1)  # Extract YYYYMMDD
                        dates.add(date_str)

                # Handle GHRSST NetCDF filenames
                elif filename.startswith("ghrsst_sst_") and filename.endswith(".nc"):
                    date_str = filename.split('_')[2].split('.')[0]  # Extract YYYYMMDD
                    dates.add(date_str)

            if response.get('IsTruncated'):
                continuation_token = response.get('NextContinuationToken')
            else:
                break

        sorted_dates = sorted(dates)
        formatted_dates = [f"{d[:4]}/{d[4:6]}/{d[6:]}" for d in sorted_dates]
        return jsonify(formatted_dates)

    except Exception as e:
        print(f"Error listing dates: {e}")
        return jsonify({"error": str(e)}), 500
    
def nan_to_null(data):
    """Convert NaN values in a nested list to None for JSON compatibility."""
    if isinstance(data, list):
        return [nan_to_null(item) for item in data]
    elif isinstance(data, np.ndarray):
        return nan_to_null(data.tolist())
    elif np.isnan(data):
        return None
    return data

@app.route('/fetch_netcdf', methods=['GET'])
def fetch_netcdf():
    dataset = request.args.get('dataset')
    date = request.args.get('date')  # Format: yyyy/mm/dd
    variable = request.args.get('variable')  # conc_chl, conc_tsm, cdom, or sst
    bucket_name = 'wamsi-westport-project-1-1'

    # Convert to filename format: YYYYMMDD
    date_str = date.replace('/', '')

    try:
        if dataset == 'Sentinel_2':
            # Handle PNG files for Sentinel-2
            if variable == 'conc_chl':
                prefix = f'csiem-data/data-lake/ESA/Sentinel_2/leaflet/CHL_img/{date_str}.png'
            elif variable == 'conc_tsm':
                prefix = f'csiem-data/data-lake/ESA/Sentinel_2/leaflet/TSM_img/{date_str}.png'
            elif variable == 'cdom':
                prefix = f'csiem-data/data-lake/ESA/Sentinel_2/leaflet/CDOM_img/{date_str}.png'
            elif variable == 'True_Color':
                prefix = f'csiem-data/data-lake/ESA/Sentinel_2/leaflet/True_Color/{date_str}.png'
            else:
                return jsonify({'error': 'Invalid variable for Sentinel_2'}), 400

            # Download PNG from S3
            temp_dir = '/tmp' if os.name != 'nt' else os.getenv('TEMP')
            if not os.path.exists(temp_dir):
                os.makedirs(temp_dir)

            local_file = os.path.join(temp_dir, f"{date_str}.png")
            try:
                print(f"Downloading file: s3://{bucket_name}/{prefix} to {local_file}")
                s3_client.download_file(bucket_name, prefix, local_file)
            except botocore.exceptions.ClientError as e:
                code = e.response['Error']['Code']
                if code == '404':
                    return jsonify({'error': f'File not found: {prefix}'}), 404
                elif code == '403':
                    return jsonify({'error': 'Access denied to the requested file'}), 403
                else:
                    return jsonify({'error': f'Error downloading file: {str(e)}'}), 500

            # Try to extract bounds with rasterio
            try:
                with rasterio.open(local_file) as src:
                    bounds = src.bounds
                    src_crs = src.crs
                    if src_crs:
                        lon_min, lat_min, lon_max, lat_max = transform_bounds(src_crs, 'EPSG:4326', *bounds)
                    else:
                        # Fallback to fixed bounds
                        lat_min, lat_max = -32.30, -31.945
                        lon_min, lon_max = 115.394, 115.804
            except rasterio.errors.RasterioIOError:
                # Fallback to fixed bounds if not georeferenced
                lat_min, lat_max = -32.30, -31.945
                lon_min, lon_max = 115.394, 115.804

            # Read and optionally flip PNG
            with Image.open(local_file) as img:
                # Flip vertically if needed (uncomment if confirmed)
                # img = img.transpose(Image.FLIP_TOP_BOTTOM)
                buf = BytesIO()
                img.save(buf, format='PNG')
                img_data = buf.getvalue()
            img_str = base64.b64encode(img_data).decode('utf-8')

            # Clean up
            os.remove(local_file)

            return jsonify({
                'image': img_str,
                'lat_min': float(lat_min),
                'lat_max': float(lat_max),
                'lon_min': float(lon_min),
                'lon_max': float(lon_max)
            })

        elif dataset == 'GHRSST':
            # Handle NetCDF for GHRSST SST
            prefix = f'csiem-data/data-lake/NASA/GHRSST/NC/ghrsst_sst_{date_str}.nc'

            # Download file from S3
            temp_dir = '/tmp' if os.name != 'nt' else os.getenv('TEMP')
            if not os.path.exists(temp_dir):
                os.makedirs(temp_dir)

            local_file = os.path.join(temp_dir, os.path.basename(prefix))
            try:
                print(f"Downloading file: s3://{bucket_name}/{prefix} to {local_file}")
                s3_client.download_file(bucket_name, prefix, local_file)
            except botocore.exceptions.ClientError as e:
                code = e.response['Error']['Code']
                if code == '404':
                    return jsonify({'error': f'File not found: {prefix}'}), 404
                elif code == '403':
                    return jsonify({'error': 'Access denied to the requested file'}), 403
                else:
                    return jsonify({'error': f'Error downloading file: {str(e)}'}), 500

            # Open dataset safely
            with xr.open_dataset(local_file) as ds:
                print(f"Opened dataset: {ds}")

                lon_name = 'lon' if 'lon' in ds.variables else 'longitude'
                lat_name = 'lat' if 'lat' in ds.variables else 'latitude'
                lat = ds[lat_name].values
                lon = ds[lon_name].values
                lon_min, lon_max = lon.min(), lon.max()
                lat_min, lat_max = lat.min(), lat.max()

                data_var = ds[variable].where(ds[variable] != 0)  # Replace 0s with NaN
                if 'time' in data_var.dims:
                    data_var = data_var.squeeze('time')
                if data_var.isnull().all():
                    return jsonify({'message': 'No data found within this region!'}), 204

                # Plot setup
                fig, ax = plt.subplots(figsize=(8, 6), subplot_kw={'projection': ccrs.PlateCarree()})
                extent = [lon_min, lon_max, lat_min, lat_max]
                ax.set_extent(extent, crs=ccrs.PlateCarree())

                # Colormap & normalization
                cmap = plt.get_cmap('jet')
                cmap.set_bad(color='gray')
                vmin, vmax = np.nanmin(data_var), np.nanmax(data_var)
                norm = Normalize(vmin=vmin, vmax=vmax)

                # Plot data
                img = ax.imshow(data_var, extent=extent, cmap=cmap, transform=ccrs.PlateCarree(),
                                origin='lower', norm=norm)

                ax.set_aspect(aspect='auto')
                ax.set_axis_off()

                # Save image to buffer
                buf = BytesIO()
                plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0)
                buf.seek(0)
                plt.close()

            # Clean up
            os.remove(local_file)

            # Encode to base64
            img_str = base64.b64encode(buf.getvalue()).decode('utf-8')
            data_var_list = nan_to_null(data_var.values)

            return jsonify({
                'data_var': data_var_list,
                'image': img_str,
                'lat_min': float(lat_min),
                'lat_max': float(lat_max),
                'lon_min': float(lon_min),
                'lon_max': float(lon_max)
            })

        else:
            return jsonify({'error': 'Invalid dataset. Use Sentinel_2 or GHRSST'}), 400

    except Exception as e:
        print(f"Error processing data: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/fetch_colorbar', methods=['POST'])
def fetch_colorbar():
    data = request.json
    variable = data.get('variable')
    data_var = np.array(data.get('data_var'))
    
    figsize = (0.3, 6) if variable == 'analysed_sst' else (0.2, 4)
    fig, ax = plt.subplots(figsize=figsize)

    if variable == "conc_chl":
        color_values = np.array([
            [147,0,108], [111,0,144], [72,0,183], [33,0,222], [0,10,255], [0,74,255],
            [0,144,255], [0,213,255], [0,255,215], [0,255,119], [0,255,15], [96,255,0],
            [200,255,0], [255,235,0], [255,183,0], [255,131,0], [255,79,0], [255,31,0],
            [230,0,0], [165,0,0], [105,0,0]
        ]) / 255.0
        sample_values = [
            0.0106, 0.0151, 0.0222, 0.0326, 0.0479, 0.0683,
            0.1003, 0.1473, 0.2165, 0.3088, 0.4534, 0.6661,
            0.9786, 1.3961, 2.0496, 3.0113, 4.4241, 6.3114,
            9.2656, 13.6130, 20.0
        ]
        cmap = mcolors.ListedColormap(color_values)
        norm = mcolors.BoundaryNorm(sample_values, len(sample_values))
        tick_locs = [0.011, 0.07, 0.46, 1.39, 3.03, 6.01, 20]
        tick_labels = [f"{loc:.2f}" for loc in tick_locs]

        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap),
                            cax=ax, orientation="vertical", extend="both")
        cbar.set_label("Chl-a (mg/m³)")
        cbar.set_ticks(tick_locs)
        cbar.set_ticklabels(tick_labels)

    elif variable == "conc_tsm":
        cmap = cmocean.cm.turbid
        norm = Normalize(vmin=0, vmax=4)
        tick_locs = [0, 1, 2, 3, 4]
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap),
                            cax=ax, orientation="vertical", extend="both")
        cbar.set_label("TSM (mg/L)")
        cbar.set_ticks(tick_locs)

    elif variable == "cdom":
        cmap = plt.cm.YlOrBr
        norm = Normalize(vmin=0, vmax=4)
        tick_locs = [0, 1, 2, 3, 4]
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap),
                            cax=ax, orientation="vertical", extend="both")
        cbar.set_label("CDOM (m⁻¹)")
        cbar.set_ticks(tick_locs)

    elif variable == "True_Color":
        plt.close(fig)
        return jsonify({"message": "True Color layer has no colorbar."}), 204

    else:
        cmap = plt.get_cmap('jet')
        cmap.set_bad(color='gray')
        vmin, vmax = np.nanmin([x for x in np.ravel(data_var) if x is not None]), np.nanmax([x for x in np.ravel(data_var) if x is not None])
        norm = Normalize(vmin=vmin, vmax=vmax)
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=ax, orientation='vertical', extend='both')
        cbar.set_label('Sea Surface Temperature (°C)')

    buf = BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0.1, transparent=True)
    buf.seek(0)
    plt.close(fig)
    return send_file(buf, mimetype='image/png')

if __name__ == '__main__':
    app.run(debug=True)