const path = require("path");
const webpack = require('webpack');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
	let config = {
		mode: "production",
		entry: {
			tikzjax: './src/index.js',
			'run-tex': './src/run-tex.js',
		},
		output: {
			path: path.resolve(__dirname, 'dist'),
			filename: '[name].js'
		},
		resolve: {
			fallback: {
				buffer: require.resolve("buffer/"),
				process: require.resolve("process/browser")
			}
		},
		module: {
			rules: [
				{
					test: /\.css$/,
					use: ["style-loader", "css-loader"]
				}
			]
		},
		performance: {
			hints: false
		},
		plugins: [
			new CopyPlugin({
				patterns: [
					{ from: "./css/fonts.css", to: path.resolve(__dirname, 'dist') },
					{ from: "./core.dump.gz", to: path.resolve(__dirname, 'dist'), noErrorOnMissing: true },
					{ from: "./tex.wasm.gz", to: path.resolve(__dirname, 'dist'), noErrorOnMissing: true }
				]
			}),
			new webpack.ProvidePlugin({
				Buffer: ['buffer', 'Buffer'],
				process: 'process'
			}),
			new TerserPlugin({
				terserOptions: { format: { comments: false } },
				extractComments: false
			})
		]
	};

	if (argv.mode == "development") {
		console.log("Using development mode.");
		config.mode = "development";
		config.devtool = "source-map";
	} else {
		console.log("Using production mode.");
	}

	return config;
};
