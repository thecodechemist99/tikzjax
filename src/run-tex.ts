import { dvi2html } from 'dvi2html';
import { expose } from "threads/worker";
import * as pako from 'pako';
import { Buffer } from 'buffer';
import { Writable } from 'stream-browserify';
import * as library from './library';
import { texFilesBase64 } from './../tex_files/texFilesBase64';

////////////////////////////////////////////////////////////////////////////////

var coredump: Uint8Array;
var code: Uint8Array;

async function loadDecompress(file: keyof typeof texFilesBase64): Promise<Uint8Array> {
	const prefix = "data:application/gzip;base64,";
	const gzippedString = texFilesBase64[file];
    const gzippedBuffer = Buffer.from(gzippedString.substring(prefix.length), 'base64');

	try {
		const unzippedBuffer = pako.ungzip(gzippedBuffer);
		return unzippedBuffer;
	} catch (e) {
		throw `Unable to load ${file}.  File not available.`;
	}
}

expose({
	load: async function() {
		code = await loadDecompress('tex.wasm.gz');
		coredump = new Uint8Array(await loadDecompress('core.dump.gz'), 0, library.pages * 65536);
	},
	texify: async function(input: string, dataset: DOMStringMap) {
		// Set up the tex input file.
		let texPackages = dataset.texPackages ? JSON.parse(dataset.texPackages) : {};

		input = Object.entries(texPackages).reduce((usePackageString, thisPackage) => {
			usePackageString += '\\usepackage' + (thisPackage[1] ? `[${thisPackage[1]}]` : '') +
				`{${thisPackage[0]}}`;
			return usePackageString;
		}, "") +
			(dataset.tikzLibraries ? `\\usetikzlibrary{${dataset.tikzLibraries}}` : '') +
			(dataset.addToPreamble || '') +
			(dataset.tikzOptions ? `[${dataset.tikzOptions}]` : '') +
			input;

		if (dataset.showConsole) {
			library.setShowConsole();

			console.log("TikZJax: Rendering input:");
			console.log(input);
		}

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
