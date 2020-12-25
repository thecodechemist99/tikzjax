const path = require("path");
const webpack = require('webpack');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
	mode: 'development',
	entry: {
		tikzjax: './src/index.js'
	},
	resolve: {
		alias: {
			'fs': 'browserfs/dist/shims/fs.js',
			'path': 'browserfs/dist/shims/path.js',
			'bfsGlobal': require.resolve('browserfs')
		}
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		publicPath: '/',
		filename: '[name].js'
	},
	node: {
		Buffer: true
	},
	target: 'web',
	devtool: 'source-map',
	module: {
		noParse: /browserfs\.js/,
		rules: [
			{
				test: /\.js$/,
				exclude: /node_module/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: ['@babel/preset-env'],
						plugins: [['@babel/plugin-transform-runtime']]
					}
				}
			},
			{
				test: /run-tex\.js$/,
				loader: 'threads-webpack-plugin',
				options: {}
			}
		]
	},
	performance: {
		hints: false
	},
	plugins: [
		new CopyPlugin({
			patterns: [
				{ from: "./fonts.css", to: path.resolve(__dirname, 'dist') },
				{ from: "./loader.css", to: path.resolve(__dirname, 'dist') },
				{ from: "./core.dump.gz", to: path.resolve(__dirname, 'dist'), noErrorOnMissing: true },
				{ from: "./tex.wasm", to: path.resolve(__dirname, 'dist'), noErrorOnMissing: true }
			]
		})
	]
};
