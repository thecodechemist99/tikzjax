const path = require("path");
const webpack = require('webpack');
const fs = require('fs');

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
	devtool: '#source-map',
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
			}
			//{
			//  test: /index\.js$/,
			//  loader: 'string-replace-loader',
			//  options: {
			//    multiple: [
			//      { search: "'/tex.wasm'", replace: "'/e412953e46efd2b8af997ad3c5b1c32c0b206f2d.wasm'" },
			//      { search: "'/core.dump.gz'", replace: "'/a9fb51a852b7e870033151a083ca8671a0adcb6a.gz'" }
			//    ]
			//  }
			//}
		]
	},
	performance: {
		hints: false
	},
	plugins: [
	]
};
