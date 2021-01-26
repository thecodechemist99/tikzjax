import { dvi2html } from 'dvi2html';
import { expose } from "threads/worker";
import pako from 'pako';
import { Buffer } from 'buffer';
import { Writable } from 'stream-browserify';
import * as library from './library';

var coredump;
var code;
var urlRoot;

async function loadDecompress(file) {
	let response = await fetch(`${urlRoot}/${file}`);
	if (response.ok) {
		const reader = response.body.getReader();
		const inf = new pako.Inflate();

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

expose({
	load: async function(_urlRoot) {
		urlRoot = _urlRoot;
		code = await loadDecompress('tex.wasm.gz');
		coredump = new Uint8Array(await loadDecompress('core.dump.gz'), 0, library.pages * 65536);
	},
	texify: async function(input, dataset) {
		// Set up the tex input file.
		let texPackages = dataset.texPackages ? JSON.parse(dataset.texPackages) : {};

		input = Object.entries(texPackages).reduce((usePackageString, thisPackage) => {
			usePackageString += '\\usepackage' + (thisPackage[1] ? `[${thisPackage[1]}]` : '') +
				`{${thisPackage[0]}}`;
			return usePackageString;
		}, "") +
			(dataset.tikzLibraries ? `\\usetikzlibrary{${dataset.tikzLibraries}}` : '') +
			(dataset.addToPreamble || '') +
			'\\begin{document}\\begin{tikzpicture}' +
			(dataset.tikzOptions ? `[${dataset.tikzOptions}]` : '') +
			input + '\n\\end{tikzpicture}\\end{document}\n';

		if (dataset.showConsole) library.setShowConsole();

		library.writeFileSync("input.tex", Buffer.from(input));

		// Set up the tex web assembly.
		let memory = new WebAssembly.Memory({ initial: library.pages, maximum: library.pages });

		let buffer = new Uint8Array(memory.buffer, 0, library.pages * 65536);
		buffer.set(coredump.slice(0));

		library.setMemory(memory.buffer);
		library.setInput(" input.tex \n\\end\n");
		library.setFileLoader(loadDecompress);

		let wasm = await WebAssembly.instantiate(code, {
			library: library,
			env: { memory: memory }
		});

		// Execute the tex web assembly.
		await library.executeAsync(wasm.instance.exports);

		// Extract the generated dvi file.
		let dvi = library.readFileSync("input.dvi").buffer;

		// Clean up the library for the next run.
		library.deleteEverything();

		// Use dvi2html to convert the dvi to svg.
		let html = "";
		const page = new Writable({
			write(chunk, encoding, callback) {
				html = html + chunk.toString();
				callback();
			}
		});

		async function* streamBuffer() {
			yield Buffer.from(dvi);
			return;
		}

		await dvi2html(streamBuffer(), page);

		return html;
	}
});
