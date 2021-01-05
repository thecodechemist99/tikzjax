import { dvi2html } from '../../dvi2html';
import { Writable } from 'stream-browserify';
import { Buffer } from 'buffer';
import { Worker, spawn, Thread } from 'threads';
import localForage from "localforage";
import md5 from 'md5';
import '../css/loader.css';

// document.currentScript polyfill
if (document.currentScript === undefined) {
	var scripts = document.getElementsByTagName('script');
	document.currentScript = scripts[scripts.length - 1];
}

// Determine where this script was loaded from. We will use that to find the files to load.
var url = new URL(document.currentScript.src);

async function processPage() {
	let currentProcessPromise = new Promise(async function(resolve, reject) {
		let texQueue = [];

		async function loadCachedOrSetupLoader(elt) {
			let div = document.createElement('div');
			elt.replaceWith(div);
			elt.div = div;

			// Transfer any classes set for the script element to the new div.
			div.classList = elt.classList;
			div.classList.add("tikzjax-container");

			let savedSVG = await localForage.getItem(md5(JSON.stringify(elt.dataset) + elt.childNodes[0].nodeValue));

			if (savedSVG) {
				div.innerHTML = savedSVG;

				let svg = div.getElementsByTagName('svg');
				div.style.width = elt.getAttribute("width") || svg[0].getAttribute("width");
				div.style.height = elt.getAttribute("height") || svg[0].getAttribute("height");

				// Emit a bubbling event that the svg is ready.
				const loadFinishedEvent = new Event('tikzjax-load-finished', { bubbles: true});
				div.dispatchEvent(loadFinishedEvent);
			} else {
				texQueue.push(elt);
				div.style.width = elt.getAttribute("width") || 100 + "px";
				div.style.height = elt.getAttribute("height") || 100 + "px";
				div.style.position = 'relative';

				// Add another div with a loading background and another div to show a spinning loader class.
				let loaderBackgroundDiv = document.createElement('div');
				loaderBackgroundDiv.classList.add('tj-loader-background');
				div.appendChild(loaderBackgroundDiv);
				let loaderDiv = document.createElement('div');
				loaderDiv.classList.add('tj-loader-spinner');
				div.appendChild(loaderDiv);
			}
		}

		async function process(elt) {
			let text = elt.childNodes[0].nodeValue;
			let div = elt.div;

			let dvi;
			try {
				dvi = await window.TikzJax.texWorker.texify(text, Object.assign({}, elt.dataset));
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

			div.style.width = elt.getAttribute("width") || machine.paperwidth.toString() + "pt";
			div.style.height = elt.getAttribute("height") || machine.paperheight.toString() + "pt";
			div.style.position = null;

			let md5hash = md5(JSON.stringify(elt.dataset) + text);

			let ids = html.match(/\bid="[^"]*"/g);
			if (ids) {
				// Sort the ids from longest to shortest.
				ids.sort((a, b) => { return b.length - a.length; });
				for (let id of ids) {
					let pgfIdString = id.replace(/id="pgf(.*)"/, "$1");
					html = html.replaceAll("pgf" + pgfIdString, `pgf${md5hash}${pgfIdString}`);
				}
			}
			div.innerHTML = html;

			let svg = div.getElementsByTagName('svg');
			svg[0].style.width = '100%';
			svg[0].style.height = '100%';

			try {
				await localForage.setItem(md5hash, div.innerHTML);
			} catch (err) {
				console.log(err);
			}

			// Emit a bubbling event that the svg image generation is complete.
			const loadFinishedEvent = new Event('tikzjax-load-finished', { bubbles: true});
			div.dispatchEvent(loadFinishedEvent);
		};

		let scripts = document.getElementsByTagName('script');
		let tikzScripts = Array.prototype.slice.call(scripts).filter(
			(e) => (e.getAttribute('type') === 'text/tikz')
		);

		// First check the session storage to see if an image is already cached,
		// and if so load that.  Otherwise show a spinning loader, and push the
		// element onto the queue to run tex on.
		for (let element of tikzScripts) {
			await loadCachedOrSetupLoader(element);
		}

		// End here if there is nothing to run tex on.
		if (!texQueue.length) return resolve();

		window.TikzJax.texWorker = await window.TikzJax.texWorker;

		// Hack to keep the worker thread alive in Firefox.
		let queryInterval = setInterval(async () => await window.TikzJax.texWorker.queryStatus(), 1000);

		window.TikzJax.processQueue.push(currentProcessPromise);
		if (window.TikzJax.processQueue.length > 1) {
			await window.TikzJax.processQueue[window.TikzJax.processQueue.length - 2];
		}

		// Run tex on the text in each of the scripts that wasn't cached.
		for (let element of texQueue) {
			await process(element);
		}

		clearInterval(queryInterval);

		window.TikzJax.processQueue.shift();

		return resolve();
	});
	return currentProcessPromise;
}

async function initializeWorker() {
	var urlRoot = url.href.replace(/\/tikzjax(\.min)?\.js$/, '');

	// Load the assembly and core dump.
	const tex = await spawn(new Worker(`${urlRoot}/run-tex.js`));
	Thread.events(tex).subscribe(e => {
		if (e.type == "message" && typeof(e.data) === "string") console.log(e.data);
	});

	try {
		await tex.load(urlRoot);
	} catch (err) {
		console.log(err);
	}

	return tex;
}

window.addEventListener('load', async () => {
	localForage.config({ name: 'TikzJax', storeName: 'svgImages' });
	window.TikzJax = {
		typeset: async function() {
			const processPageEvent = new Event('tikzjax-process-page', { bubbles: true});
			document.dispatchEvent(processPageEvent);
		},
		processQueue: []
	};

	document.addEventListener('tikzjax-process-page', processPage);

	TikzJax.typeset();
	TikzJax.texWorker = initializeWorker();
});

// Close the thread when the window is closed.
window.addEventListener('unload', async () => await Thread.terminate(window.TikzJax.texWorker));
