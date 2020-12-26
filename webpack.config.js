const path = require("path");
const webpack = require('webpack');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
	mode: 'development',
	entry: {
		tikzjax: './src/index.js'
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		publicPath: './',
		filename: '[name].js'
	},
	devtool: 'source-map',
	module: {
		rules: [
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
