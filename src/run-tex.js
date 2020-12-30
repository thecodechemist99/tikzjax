import { expose, Transfer } from "threads/worker";
import pako from 'pako';
import fetchStream from 'fetch-readablestream';
import { Buffer } from 'buffer';
import * as library from './library';

var pages = 2000;
var coredump;
var code;
var urlRoot;

async function loadDecompress(file, string = false) {
	let response = await fetchStream(`${urlRoot}/${file}`);
	if (response.ok) {
		let inflateOptions = {};
		if (string) inflateOptions.to = 'string';
		const reader = response.body.getReader();
		const inf = new pako.Inflate(inflateOptions);

		try {
			while (true) {
				const {done, value} = await reader.read();
				inf.push(value, done);
				if (done) break;
			}
		} finally {
			reader.releaseLock();
		}

		return inf;
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
				library.writeFileSync(filename, data.result);
			}
		} else {
			throw `Unable to load ${dir}/${libName}.json.  File not available`;
		}
	}
}

expose({
	load: async function(_urlRoot) {
		urlRoot = _urlRoot;

		let texWASM = await loadDecompress('tex.wasm.gz');
		code = texWASM.result;

		let inf = await loadDecompress('core.dump.gz');
		coredump = new Uint8Array(inf.result, 0, pages * 65536);
	},
	texify: async function(input, dataset) {
		library.deleteEverything();

		// Load requested packages.
		if (dataset.packages) await loadLibList(dataset.packages.split(","), "packages");

		// Load requested tikz libraries.
		if (dataset.tikzLibraries) await loadLibList(dataset.tikzLibraries.split(","), "tikz_libs");

		input = (dataset.packages ? ('\\usepackage{' + dataset.packages + '}') : '') +
			(dataset.tikzLibraries ? ('\\usetikzlibrary{' + dataset.tikzLibraries + '}') : '') +
			(dataset.addToPreamble || '') +
			'\\begin{document}\\begin{tikzpicture}' +
			(dataset.tikzOptions ? ('[' + dataset.tikzOptions + ']') : '') + '\n'
			+ input + '\n\\end{tikzpicture}\\end{document}\n';

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

		return Transfer(library.readFileSync("input.dvi").buffer);
	}
});
