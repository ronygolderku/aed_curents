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
import matplotlib.pyplot as plt
from io import BytesIO
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from contextlib import closing
import cmocean  # Ensure cmocean is installed for colormaps
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

                # Handle Sentinel_2 filenames
                if filename.startswith("s2_") and filename.endswith(".nc"):
                    # Extract date from s2_chl_20240321.nc or s2_tsm_20240321.nc
                    date_match = re.match(r"s2_(chl|tsm|cdom)_(\d{8})\.nc", filename)
                    if date_match:
                        date_str = date_match.group(2)  # Extract 20240321
                        dates.add(date_str)
                
                # # Handle CDOM filenames: Subset_S2_MSIL2A_20240311T021341.nc
                # elif filename.startswith("s2_cdom_") and filename.endswith(".nc"):
                #     date_match = re.match(r"s2_cdom_(\d{8})\.nc", filename)
                #     if date_match:
                #         date_str = date_match.group(1)  # Extract 20240311
                #         dates.add(date_str)

                # GHRSST case: ghrsst_sst_20020601.nc
                elif filename.startswith("ghrsst_sst_") and filename.endswith(".nc"):
                    date_str = filename.split('_')[2].split('.')[0]  # Extract 20020601
                    dates.add(date_str)

            if response.get('IsTruncated'):  # Check if there are more pages
                continuation_token = response.get('NextContinuationToken')
            else:
                break

        sorted_dates = sorted(dates)
        # Optional: format to yyyy/mm/dd if needed
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
    variable = request.args.get('variable')  # conc_chl, conc_tsm, CDOM, or sst
    bucket_name = 'wamsi-westport-project-1-1'

    # Convert to filename format: YYYYMMDD
    date_str = date.replace('/', '')

    # Set up prefix path
    if dataset == 'Sentinel_2':
        if variable == 'conc_chl':
            prefix = f'csiem-data/data-lake/ESA/Sentinel_2/CHL/s2_chl_{date_str}.nc'
        elif variable == 'conc_tsm':
            prefix = f'csiem-data/data-lake/ESA/Sentinel_2/TSM/s2_tsm_{date_str}.nc'
        elif variable == 'cdom':
            prefix = f'csiem-data/data-lake/ESA/Sentinel_2/CDOM/s2_cdom_{date_str}.nc'
        else:
            return jsonify({'error': 'Invalid variable for Sentinel_2'}), 400
    elif dataset == 'GHRSST':
        prefix = f'csiem-data/data-lake/NASA/GHRSST/NC/ghrsst_sst_{date_str}.nc'
    else:
        return jsonify({'error': 'Invalid dataset. Use Sentinel_2 or GHRSST'}), 400

    try:
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
            if dataset == 'GHRSST' and 'time' in data_var.dims:
                data_var = data_var.squeeze('time')  # Remove singleton time dimension
            if data_var.isnull().all():
                return jsonify({'message': 'No data found within this region!'}), 204

            # Plot setup
            fig, ax = plt.subplots(figsize=(8, 6), subplot_kw={'projection': ccrs.PlateCarree()})
            extent = [lon_min, lon_max, lat_min, lat_max]
            ax.set_extent(extent, crs=ccrs.PlateCarree())

            # Colormap & normalization
            if variable == 'conc_chl':
                cmap = plt.get_cmap('jet')
                cmap.set_bad(color='gray')
                norm = LogNorm(vmin=10**-1.7, vmax=10**1.5)
            elif variable == 'conc_tsm':
                cmap = cmocean.cm.turbid
                cmap.set_bad(color='gray')
                norm = Normalize(vmin=0, vmax=4)
            elif variable == 'cdom':
                cmap = plt.get_cmap('jet')
                cmap.set_bad(color='gray')
                norm = Normalize(vmin=0.06, vmax=3.45)
            else:
                cmap = plt.get_cmap('jet')
                cmap.set_bad(color='gray')
                vmin, vmax = np.nanmin(data_var), np.nanmax(data_var)
                norm = Normalize(vmin=vmin, vmax=vmax)
            # Plot data
            img = ax.imshow(data_var, extent=extent, cmap=cmap, transform=ccrs.PlateCarree(),
                            origin='lower' if variable == 'analysed_sst' else 'upper', norm=norm)

            ax.set_aspect(aspect='auto')  # Adjust aspect ratio
            # Turn of axis
            ax.set_axis_off()

            # Save image to buffe
            buf = BytesIO()
            plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0)
            buf.seek(0)
            plt.close()

        # Clean up after dataset is closed
        os.remove(local_file)

        # Encode to base64
        img_str = base64.b64encode(buf.getvalue()).decode('utf-8')
        data_var_list = nan_to_null(data_var.values)  # Convert NaN to None for JSON compatibility
        return jsonify({
            'data_var': data_var_list, 
            'image': img_str,
                'lat_min': float(lat_min),
                'lat_max': float(lat_max),
                'lon_min': float(lon_min),
                'lon_max': float(lon_max)
            })

    except Exception as e:
        print(f"Error processing NetCDF file: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/fetch_colorbar', methods=['POST'])
def fetch_colorbar():
    data = request.json
    variable = data.get('variable')
    data_var = np.array(data.get('data_var'))
    # Set figure size based on variable
    figsize = (0.3, 6) if variable == 'analysed_sst' else (0.2, 4)
    fig, ax = plt.subplots(figsize=figsize)

    # Define colormap and normalization based on variable
    if variable == 'conc_chl':
        cmap = plt.get_cmap('jet')
        cmap.set_bad(color='gray')
        norm = LogNorm(vmin=10**-1.7, vmax=10**1.5)
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=ax, orientation='vertical', extend='both')
        cbar.set_label('Chl-a concentration (Log10 mg/m$^3$)')
        ticks = [10**-1.7, 10**-1.2, 10**-0.9, 10**-0.6, 10**-0.3, 10**0, 10**0.3, 10**0.6, 10**0.9, 10**1.2, 10**1.5]
        cbar.set_ticks(ticks)
        cbar.ax.yaxis.set_major_formatter(FuncFormatter(lambda x, pos: "{:.1f}".format(np.log10(x)) if x in ticks else ''))
        cbar.ax.yaxis.set_minor_locator(NullLocator())
    elif variable == 'conc_tsm':
        cmap = cmocean.cm.turbid
        cmap.set_bad(color='gray')
        norm = Normalize(vmin=0, vmax=4)
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=ax, orientation='vertical', extend='both')
        cbar.set_label('Total Suspended Matter (mg/L)')
    elif variable == 'cdom':
        cmap = plt.get_cmap('jet')
        cmap.set_bad(color='gray')
        norm = Normalize(vmin=0.06, vmax=3.45)
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=ax, orientation='vertical', extend='both')
        cbar.set_label('CDOM (m$^{-1}$)')
    else:  # Default case (e.g., Sea Surface Temperature)
        cmap = plt.get_cmap('jet')
        cmap.set_bad(color='gray')
        vmin, vmax = np.nanmin([x for x in np.ravel(data_var) if x is not None]), np.nanmax([x for x in np.ravel(data_var) if x is not None])
        norm = Normalize(vmin=vmin, vmax=vmax)
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=ax, orientation='vertical', extend='both')
        cbar.set_label('Sea Surface Temperature (°C)')

    # Save the colorbar to a buffer
    buf = BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0.1)
    buf.seek(0)
    plt.close(fig)

    # Return the colorbar image
    return send_file(buf, mimetype='image/png')

if __name__ == '__main__':
    app.run(debug=True)