from flask import Flask, jsonify, request, send_file, render_template
from flask_cors import CORS
import boto3
import os
from dotenv import load_dotenv
import numpy as np
from netCDF4 import Dataset
import matplotlib
matplotlib.use('Agg')
from matplotlib.colors import LogNorm, Normalize
from matplotlib.ticker import FuncFormatter, NullLocator
import matplotlib.colors as mpl_colors
import matplotlib.pyplot as plt
from io import BytesIO
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from contextlib import closing

app = Flask(__name__)  # Initialize Flask app
CORS(app)  # Enable CORS for all routes

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
                parts = key.split('/')
                if len(parts) > 1:
                    filename = parts[-1]
                    filename_parts = filename.split('_')
                    if len(filename_parts) > 2:
                        date_part = filename_parts[2].split('.')[0]
                        dates.add(date_part)

            if response.get('IsTruncated'):  # Check if there are more pages
                continuation_token = response.get('NextContinuationToken')
            else:
                break

        sorted_dates = sorted(dates)
        formatted_dates = [f"{date[:4]}/{date[4:6]}/{date[6:]}" for date in sorted_dates]
        return jsonify(formatted_dates)
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/fetch_netcdf', methods=['GET'])
def fetch_netcdf():
    dataset = request.args.get('dataset')
    date = request.args.get('date')
    variable = request.args.get('variable')
    prefix = f'csiem-data/data-lake/ESA/{dataset}/NC/S3_Chl_{date}.nc' if dataset == 'Sentinel' else f'csiem-data/data-lake/NASA/{dataset}/NC/ghrsst_sst_{date}.nc'
    bucket_name = 'wamsi-westport-project-1-1'
    
    try:
        temp_dir = '/tmp' if os.name != 'nt' else os.getenv('TEMP')
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)

        local_file = os.path.join(temp_dir, os.path.basename(prefix))
        s3_client.download_file(bucket_name, prefix, local_file)
        
        with closing(Dataset(local_file)) as dataset:
            latitude = np.array(dataset.variables['latitude'])
            longitude = np.array(dataset.variables['longitude'])
            data_var = dataset.variables[variable][:].squeeze()
        
        if np.ma.is_masked(data_var) and np.all(data_var.mask):
                return jsonify({'message': 'No data found within this region!'}), 204  # 204 No Content

        plt.figure(figsize=(8, 6))
        ax = plt.axes(projection=ccrs.PlateCarree())
        N = 64
        cmap = plt.get_cmap('jet', N)
        if variable == 'CHL':
            vmin, vmax = 10**-1.7, 10**1.5
            norm = LogNorm(vmin=vmin, vmax=vmax)
        else:
            # vmin, vmax = data_var.min(), data_var.max()
            vmin, vmax = 14, 28
            norm = Normalize(vmin=vmin, vmax=vmax)

        img = ax.pcolormesh(longitude, latitude, data_var, cmap=cmap, norm=norm, transform=ccrs.PlateCarree())

        ax.add_feature(cfeature.OCEAN, zorder=0, color='#232227')
        ax.add_feature(cfeature.LAND, zorder=1, color='#4E4E50')
        
        ax.set_extent([114, 116, -33, -31], crs=ccrs.PlateCarree())
        ax.set_aspect(aspect='auto')

        plt.axis('off')  # Turn off the axis
        buf = BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0)
        buf.seek(0)
        plt.close()
        os.remove(local_file)

        return send_file(buf, mimetype='image/png')
    except Exception as e:
        print(f"Error processing NetCDF file: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/fetch_colorbar', methods=['GET'])
def fetch_colorbar():
    dataset = request.args.get('dataset')
    variable = request.args.get('variable')
    fig, ax = plt.subplots(figsize=(0.3, 6))
    N = 64
    cmap = plt.get_cmap('jet', N)
    if variable == 'CHL':
        norm = LogNorm(vmin=10**-1.7, vmax=10**1.5)
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=ax, orientation='vertical', extend='both')
        cbar.set_label('Chl-a concentration (Log10 mg/m$^3$)')
        ticks = [10**-1.7, 10**-1.2, 10**-0.9, 10**-0.6, 10**-0.3, 10**0, 10**0.3, 10**0.6, 10**0.9, 10**1.2, 10**1.5]
        cbar.set_ticks(ticks)
        cbar.ax.yaxis.set_major_formatter(FuncFormatter(lambda x, pos: "{:.1f}".format(np.log10(x)) if x in ticks else ''))
        cbar.ax.yaxis.set_minor_locator(NullLocator())
    else:
        norm = Normalize(vmin=14, vmax=28)
        cbar = plt.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=ax, orientation='vertical', extend='both')
        cbar.set_label('Sea Surface Temperature (°C)')
    
    buf = BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0.1)
    buf.seek(0)
    plt.close(fig)
    
    return send_file(buf, mimetype='image/png')

if __name__ == '__main__':
    app.run(debug=True)
