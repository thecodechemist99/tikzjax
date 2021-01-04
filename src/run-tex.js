import { expose, Transfer } from "threads/worker";
import pako from 'pako';
import { Buffer } from 'buffer';
import * as library from './library';

var pages = 1000;
var coredump;
var code;
var urlRoot;

async function loadDecompress(file, string = false) {
	let response = await fetch(`${urlRoot}/${file}`);
	if (response.ok) {
		let inflateOptions = {};
		if (string) inflateOptions.to = 'string';
		const reader = response.body.getReader();
		const inf = new pako.Inflate(inflateOptions);

		while (true) {
			const {done, value} = await reader.read();
			if (done) break;
			inf.push(value);
		}
		reader.releaseLock();
		if (inf.err) { throw new Error(inf.err); }

		return inf.result;
	} else {
		throw `Unable to load ${file}.  File not available.`;
	}
}

async function loadLibList(libNames, dir) {
	for (const libName of libNames) {
		let response = await fetch(`${urlRoot}/${dir}/${libName}.json`);
		if (response.ok) {
			let fileList = JSON.parse(await response.text());
			for (const filename of fileList) {
				if (library.fileExists(filename)) continue;
				let data = await loadDecompress(`tex_files/${filename}.gz`, true);
				library.writeFileSync(filename, data);
			}
		} else {
			throw `Unable to load ${dir}/${libName}.json.  File not available`;
		}
	}
}

expose({
	load: async function(_urlRoot) {
		urlRoot = _urlRoot;
		code = await loadDecompress('tex.wasm.gz');
		coredump = new Uint8Array(await loadDecompress('core.dump.gz'), 0, pages * 65536);
	},
	texify: async function(input, dataset) {
		// Load requested packages.
		let packageList = dataset.packages ? dataset.packages.split(",") : [];
		await loadLibList(packageList, "packages");

		// Load requested tikz libraries.
		if (dataset.tikzLibraries) await loadLibList(dataset.tikzLibraries.split(","), "tikz_libs");

		let packageOptions = dataset.packageOptions ? JSON.parse(dataset.packageOptions) : {};

		input = packageList.reduce((usePackageString, thisPackage) => {
			usePackageString += '\\usepackage' +
				(thisPackage in packageOptions ? `[${packageOptions[thisPackage]}]` : '') +
				`{${thisPackage}}`;
			return usePackageString;
		}, "") +
			(dataset.tikzLibraries ? `\\usetikzlibrary{${dataset.tikzLibraries}}` : '') +
			(dataset.addToPreamble || '') +
			'\\begin{document}\\begin{tikzpicture}' +
			(dataset.tikzOptions ? `[${dataset.tikzOptions}]` : '') + '\n'
			+ input + '\n\\end{tikzpicture}\\end{document}\n';

		if (dataset.showConsole) library.setShowConsole();

		library.writeFileSync("input.tex", Buffer.from(input));

		let memory = new WebAssembly.Memory({ initial: pages, maximum: pages });

		let buffer = new Uint8Array(memory.buffer, 0, pages * 65536);
		buffer.set(coredump.slice(0));

		library.setMemory(memory.buffer);
		library.setInput(" input.tex \n\\end\n");

		await WebAssembly.instantiate(code, {
			library: library,
			env: { memory: memory }
		});

		library.flushConsole();

		let dvi = library.readFileSync("input.dvi").buffer;

		library.deleteEverything();

		return Transfer(dvi);
	},
	// Hack to keep the worker thread alive in Firefox.
	queryStatus: function() { return Date.now(); }
});
