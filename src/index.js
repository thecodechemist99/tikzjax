import { dvi2html } from '../../dvi2html';
import { Writable } from 'stream';
import pako from 'pako';
import fetchStream from 'fetch-readablestream';
import { Worker, spawn, Thread} from 'threads';

// document.currentScript polyfill
if (document.currentScript === undefined) {
	var scripts = document.getElementsByTagName('script');
	document.currentScript = scripts[scripts.length - 1];
}

// Determine where this script was loaded from. We will use that to find the files to load.
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

	coredump = new Uint8Array(inf.result, 0, pages * 65536);
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
		let worker = new Worker(urlRoot + '/run-tex.js');
		worker.onmessage = e => { if (typeof(e.data) === "string") console.log(e.data); }
		const tex = await spawn(worker);
		try {
			dvi = await tex(text, code, coredump, urlRoot,
				elt.dataset.packages, elt.dataset.tikzLibraries, elt.dataset.tikzOptions);
		} catch (err) {
			div.style.width = 'unset';
			div.style.height = 'unset';
			console.log(err);
			div.innerHTML = "Error generating image."
			return;
		} finally {
			await Thread.terminate(tex);
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

	// First convert the script tags to divs that contain a spinning loader.
	tikzScripts.forEach(async element => setupLoader(element));

	// Wait for the assembly and core dump to finish loading.
	await loadPromise;

	// Now run tex on the text in each of the scripts.
	tikzScripts.forEach(async element => process(element));
});
