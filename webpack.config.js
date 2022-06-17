const path = require("path");
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
	let tikzjaxConfig = {
		name: "tikzjax",
		mode: "production",
		entry: {
			tikzjax: './src/index.js',
		},
		output: {
			path: path.resolve(__dirname, 'dist'),
			filename: '[name].js'
		},
		module: {
			rules: [
				{
					test: /\.css$/,
					use: ["style-loader", "css-loader"]
				},
				{
					test: /run-tex-output\.js/,
					type: 'asset/source',
				}
			]
		},
		performance: {
			hints: false
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: 'process/browser'
			})
		],
		dependencies: ["run-tex"]
	};


	let runTexConfig = {
		name: "run-tex",
		mode: "production",
		entry: {
			'run-tex-output': './src/run-tex.js',
		},
		output: {
			path: path.resolve(__dirname, 'dist'),
			filename: '[name].js'
		},
		module: {
			rules: [
				{
					test: /\.gz/,
					type: 'asset/inline',
				}
			]
		},
		performance: {
			hints: false
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: 'process/browser'
			})
		]
	};

	if (argv.mode == "development") {
		console.log("Using development mode.");
		tikzjaxConfig.mode = "development";
		tikzjaxConfig.devtool = "source-map";
		runTexConfig.mode = "development";
		runTexConfig.devtool = "source-map";
	} else {
		console.log("Using production mode.");
		// This prevents the LICENSE file from being generated.  It also minimizes the code even in development mode,
		// which is why it is here.
		tikzjaxConfig.plugins.push(new TerserPlugin({
			terserOptions: { format: { comments: false } },
			extractComments: false
		}));
		runTexConfig.plugins.push(new TerserPlugin({
			terserOptions: { format: { comments: false } },
			extractComments: false
		}));
	}

	return [runTexConfig, tikzjaxConfig];
};
