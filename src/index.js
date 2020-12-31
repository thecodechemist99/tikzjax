import { dvi2html } from '../../dvi2html';
import { Writable } from 'stream-browserify';
import { Buffer } from 'buffer';
import { Worker, spawn, Thread } from 'threads';
import md5 from 'md5';
import '../css/loader.css';

// document.currentScript polyfill
if (document.currentScript === undefined) {
	var scripts = document.getElementsByTagName('script');
	document.currentScript = scripts[scripts.length - 1];
}

// Determine where this script was loaded from. We will use that to find the files to load.
var url = new URL(document.currentScript.src);
var urlRoot = url.href.replace(/\/tikzjax(\.min)?\.js$/, '');

window.addEventListener('load', async function() {
	let texQueue = [];

	async function setupLoader(elt) {
		var div = document.createElement('div');
		elt.replaceWith(div);
		elt.div = div;

		// Transfer any classes set for the script element to the new div.
		div.classList = elt.classList;
		div.classList.add("tikzjax-container");

		let savedSVG = sessionStorage.getItem("svg:" + md5(JSON.stringify(elt.dataset) + elt.childNodes[0].nodeValue));

		if (savedSVG) {
			div.innerHTML = atob(savedSVG);

			let svg = div.getElementsByTagName('svg');
			div.style.width = elt.dataset.width || svg[0].getAttribute("width");
			div.style.height = elt.dataset.height || svg[0].getAttribute("height");

			// Emit a bubbling event that the svg image generation is complete.
			const loadFinishedEvent = new Event('tikzjax-load-finished', { bubbles: true});
			div.dispatchEvent(loadFinishedEvent);
		} else {
			texQueue.push(elt);
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
		}
	}

	async function process(elt) {
		var text = elt.childNodes[0].nodeValue;
		var div = elt.div;

		let dvi;
		try {
			dvi = await tex.texify(text, Object.assign({}, elt.dataset));
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
		div.style.position = null;

		div.innerHTML = html;

		let svg = div.getElementsByTagName('svg');
		svg[0].style.width = '100%';
		svg[0].style.height = '100%';
		svg[0].setAttribute("width", machine.paperwidth.toString() + "pt");
		svg[0].setAttribute("height", machine.paperheight.toString() + "pt");
		svg[0].setAttribute("viewBox", `-72 -72 ${machine.paperwidth} ${machine.paperheight}`);

		try {
			sessionStorage.setItem("svg:" + md5(JSON.stringify(elt.dataset) + text), btoa(div.innerHTML));
		} catch (err) {
			console.log(err);
		}

		// Emit a bubbling event that the svg image generation is complete.
		const loadFinishedEvent = new Event('tikzjax-load-finished', { bubbles: true});
		div.dispatchEvent(loadFinishedEvent);
	};

	var scripts = document.getElementsByTagName('script');
	var tikzScripts = Array.prototype.slice.call(scripts).filter(
		(e) => (e.getAttribute('type') === 'text/tikz'));

	// First check the session storage to see if an image is already cached,
	// and if so load that.  Otherwise show a spinning loader, and push the
	// element onto the queue to run tex on.
	for (let element of tikzScripts) {
		await setupLoader(element);
	}

	// End here if there is nothing to run tex on.
	if (!texQueue.length) return;

	// Next load the assembly and core dump.
	let worker = new Worker(urlRoot + '/run-tex.js');
	worker.onmessage = e => { if (typeof(e.data) === "string") console.log(e.data); }
	const tex = await spawn(worker);
	try {
		await tex.load(urlRoot);
	} catch (err) {
		console.log(err);
	} finally {
		// Now run tex on the text in each of the scripts that wasn't cached.
		for (let element of texQueue) {
			await process(element);
		}
	}

	await Thread.terminate(tex);
});
