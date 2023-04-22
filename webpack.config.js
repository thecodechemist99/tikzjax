const path = require("path");
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
	let tikzjaxConfig = {
		name: "tikzjax",
		mode: "production",
		entry: {
			tikzjax: './src/index.ts',
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
					test: /\.tsx?$/,
					use: 'ts-loader',
					exclude: /node_modules/,
				},
				{
					test: /run-tex-output\.js/,
					type: 'asset/source',
				},
				{
					test: /\.gz/,
					type: 'asset/inline',
				}
			]
		},
		resolve: {
			extensions: ['.ts', '.js'],
		},
		performance: {
			hints: false
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: 'process/browser',
        Buffer: ['buffer', 'Buffer']
			})
		],
		dependencies: ["run-tex"]
	};

	let runTexConfig = {
		name: "run-tex",
		mode: "production",
		entry: {
			'run-tex-output': './src/run-tex.ts',
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
				},
				{
					test: /\.tsx?$/,
					use: 'ts-loader',
					exclude: /node_modules/,
				}
			]
		},
		resolve: {
			extensions: ['.ts', '.js'],
		},
		performance: {
			hints: false
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: 'process/browser',
        Buffer: ['buffer', 'Buffer']
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
