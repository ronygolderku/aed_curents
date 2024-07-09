const path = require('path');
const Dotenv = require('dotenv-webpack');

module.exports = {
    entry: {
        plankton: './plankton.js',
        temperature: './temp.js'
    },
    output: {
        filename: '[name].bundle.js', // [name] will be replaced with the entry point name (e.g., plankton.bundle.js)
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            },
        ],
    },
    plugins: [
        new Dotenv()
    ],
};
