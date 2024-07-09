from flask import Flask, jsonify, request
from flask_cors import CORS
import boto3
import netCDF4 as nc
import os
import tempfile
import numpy as np

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# AWS credentials and endpoint URL
AWS_ACCESS_KEY_ID = '4b68780a4be74f31aa2e7cbc4de6dd2f'
AWS_SECRET_ACCESS_KEY = '92dcce9fa2034ac7af8fd4c92182567e'
AWS_S3_ENDPOINT = 'https://projects.pawsey.org.au'
AWS_DEFAULT_REGION = 'us-east-1'

# Initialize S3 client
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    endpoint_url=AWS_S3_ENDPOINT,
    region_name=AWS_DEFAULT_REGION
)

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
        return jsonify(sorted_dates)
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/fetch_netcdf', methods=['GET'])
def fetch_netcdf():
    dataset = request.args.get('dataset')
    date = request.args.get('date')
    variable = request.args.get('variable')

    try:
        # Construct the file path
        file_path = f'csiem-data/data-lake/ESA/{dataset}/NC/S3_Chl_{date}.nc'

        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            local_file = temp_file.name

        # Download the NetCDF file from S3
        s3_client.download_file('wamsi-westport-project-1-1', file_path, local_file)

        # Open the NetCDF file
        with nc.Dataset(local_file) as ds:
            latitudes = ds.variables['latitude'][:].tolist()
            longitudes = ds.variables['longitude'][:].tolist()
            data = ds.variables[variable][:].tolist()

        # Clean up the local file
        os.remove(local_file)

        return jsonify({
            'latitudes': latitudes,
            'longitudes': longitudes,
            'data': data
        })
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)