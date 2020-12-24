import { dvi2html } from '../../dvi2html';
import { Writable } from 'stream';
import * as library from './library';
import pako from 'pako';
import fetchStream from 'fetch-readablestream';

// document.currentScript polyfill
if (document.currentScript === undefined) {
	var scripts = document.getElementsByTagName('script');
	document.currentScript = scripts[scripts.length - 1];
}

// Determine where this script was loaded from. We will use that to find the wasm and dump files.
var url = new URL(document.currentScript.src);
var urlRoot = url.href.replace(/\/tikzjax(\.min)?\.js$/, '');

let pages = 1000;
var coredump;
var code;

async function load() {
	let tex = await fetch(urlRoot + '/tex.wasm');
	code = await tex.arrayBuffer();

	let response = await fetchStream(urlRoot + '/core.dump.gz');
	const reader = response.body.getReader();
	const inf = new pako.Inflate();

	try {
		while (true) {
			const {done, value} = await reader.read();
			inf.push(value, done);
			if (done) break;
		}
	}
	finally {
		reader.releaseLock();
	}

	coredump = new Uint8Array(inf.result, 0, pages*65536);
}

function copy(src)  {
	var dst = new Uint8Array(src.length);
	dst.set(src);
	return dst;
}

async function loadTikzLibraries(libsList) {
	for (const lib of libsList) {
		let response = await fetch(urlRoot + "/libs/" + lib + ".json.gz");
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

async function tex(input, tikzLibraries, tikzOptions) {
	input = (tikzLibraries ? ('\\usetikzlibrary{' + tikzLibraries + '}') : '') +
		'\\begin{document}\\begin{tikzpicture}' +
		(tikzOptions ? ('[' + tikzOptions + ']') : '') + '\n' + input + '\n\\end{tikzpicture}\\end{document}\n';

	library.deleteEverything();

	// Load requested tikz libraries.
	await loadTikzLibraries(tikzLibraries.split(","));

	library.writeFileSync("sample.tex", Buffer.from(input));

	let memory = new WebAssembly.Memory({ initial: pages, maximum: pages });

	let buffer = new Uint8Array(memory.buffer, 0, pages*65536);
	buffer.set(copy(coredump));

	library.setMemory(memory.buffer);
	library.setInput(" sample.tex \n\\end\n");

	await WebAssembly.instantiate(code, {
		library: library,
		env: { memory: memory }
	});

	return library.readFileSync("sample.dvi");
}

window.addEventListener('load', async function() {
	var loadPromise = load();

	async function setupLoader(elt) {
		var div = document.createElement('div');
		// Transfer any classes set for the script element to the new div.
		div.classList = elt.classList;
		div.classList.add("tikzjax-container");

		div.style.width = elt.dataset.width || 100 + "px";
		div.style.height = elt.dataset.height || 100 + "px";
		div.style.position = 'relative';

		// Add another div with a loading background and another div to show a spinning loader class.
		var loaderBackgroundDiv = document.createElement('div');
		loaderBackgroundDiv.classList.add('tj-loader-background');
		div.appendChild(loaderBackgroundDiv);
		var loaderDiv = document.createElement('div');
		loaderDiv.classList.add('tj-loader-spinner');
		div.appendChild(loaderDiv);

		elt.replaceWith(div);
		elt.div = div;
	}

	async function process(elt) {
		var text = elt.childNodes[0].nodeValue;
		var div = elt.div;

		let dvi;
		try {
			dvi = await tex(text, elt.dataset.tikzLibraries, elt.dataset.tikzOptions);
		} catch (err) {
			div.style.width = 'unset';
			div.style.height = 'unset';
			console.log(err);
			div.innerHTML = "Error generating image."
			return;
		}

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

		let machine = await dvi2html(streamBuffer(), page);

		div.style.width = elt.dataset.width || machine.paperwidth.toString() + "pt";
		div.style.height = elt.dataset.height || machine.paperheight.toString() + "pt";
		//div.style.cursor = "pointer";
		//div.addEventListener("click", () => console.log("testing events"));

		div.innerHTML = html;
		let svg = div.getElementsByTagName('svg');
		svg[0].style.width = '100%';
		svg[0].style.height = '100%';
		svg[0].setAttribute("width", machine.paperwidth.toString() + "pt");
		svg[0].setAttribute("height", machine.paperheight.toString() + "pt");
		svg[0].setAttribute("viewBox", `-72 -72 ${machine.paperwidth} ${machine.paperheight}`);
	};

	var scripts = document.getElementsByTagName('script');
	var tikzScripts = Array.prototype.slice.call(scripts).filter(
		(e) => (e.getAttribute('type') === 'text/tikz'));

	tikzScripts.forEach(async element => setupLoader(element));

	await loadPromise;

	tikzScripts.reduce(async (promise, element) => {
		await promise;
		return process(element);
	}, Promise.resolve());
});
