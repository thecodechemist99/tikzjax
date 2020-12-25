import { expose, Transfer } from "threads/worker";
import pako from 'pako';
import * as library from './library';

let pages = 1000;

async function loadPackages(packagesList, urlRoot) {
	for (const pack of packagesList) {
		let response = await fetch(urlRoot + "/packages/" + pack + ".json.gz");
		if (response.ok) {
			let data = await response.arrayBuffer();
			let filesystem = JSON.parse(pako.inflate(data, { to: 'string' }));
			for (const [file, buffer] of Object.entries(filesystem)) {
				if (!file) continue;
				library.writeFileSync(file, buffer);
			}
		} else {
			throw `Unable to load package ${pack}.  File not available.`;
		}
	}
}

async function loadTikzLibraries(libsList, urlRoot) {
	for (const lib of libsList) {
		let response = await fetch(urlRoot + "/tikz_libs/" + lib + ".json.gz");
		if (response.ok) {
			let data = await response.arrayBuffer();
			let filesystem = JSON.parse(pako.inflate(data, { to: 'string' }));
			for (const [file, buffer] of Object.entries(filesystem)) {
				if (!file) continue;
				library.writeFileSync(file, buffer);
			}
		} else {
			throw `Unable to load tikz library ${lib}.  File not available.`;
		}
	}
}

expose(async function(input, code, coredump, urlRoot, packages, tikzLibraries, tikzOptions) {
	input = (packages ? ('\\usepackage{' + packages + '}') : '') +
		(tikzLibraries ? ('\\usetikzlibrary{' + tikzLibraries + '}') : '') +
		'\\begin{document}\\begin{tikzpicture}' +
		(tikzOptions ? ('[' + tikzOptions + ']') : '') + '\n' + input + '\n\\end{tikzpicture}\\end{document}\n';

	library.deleteEverything();

	// Load requested packages.
	if (packages) await loadPackages(packages.split(","), urlRoot);

	// Load requested tikz libraries.
	if (tikzLibraries) await loadTikzLibraries(tikzLibraries.split(","), urlRoot);

	library.writeFileSync("input.tex", Buffer.from(input));

	let memory = new WebAssembly.Memory({ initial: pages, maximum: pages });

	let buffer = new Uint8Array(memory.buffer, 0, pages*65536);
	buffer.set(coredump);

	library.setMemory(memory.buffer);
	library.setInput(" input.tex \n\\end\n");

	await WebAssembly.instantiate(code, {
		library: library,
		env: { memory: memory }
	});

	return Transfer(library.readFileSync("input.dvi").buffer);
});
