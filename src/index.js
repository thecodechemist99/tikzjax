import { Worker, spawn, Thread } from 'threads';
import localForage from "localforage";
import md5 from 'md5';
import workerCode from './../dist/run-tex-output.js';

// document.currentScript polyfill
if (document.currentScript === undefined) {
	var scripts = document.getElementsByTagName('script');
	document.currentScript = scripts[scripts.length - 1];
}

var processQueue = [];
var observer = null;
var texWorker;

async function processTikzScripts(scripts) {
	let currentProcessPromise = new Promise(async function(resolve, reject) {
		let texQueue = [];

		async function loadCachedOrSetupLoader(elt) {
			elt.md5hash = md5(JSON.stringify(elt.dataset) + elt.childNodes[0].nodeValue);

			let savedSVG = await localForage.getItem(elt.md5hash);

			if (savedSVG) {
				let svg = document.createRange().createContextualFragment(savedSVG).firstChild;
				elt.replaceWith(svg);

				// Emit a bubbling event that the svg is ready.
				const loadFinishedEvent = new Event('tikzjax-load-finished', { bubbles: true});
				svg.dispatchEvent(loadFinishedEvent);
			} else {
				texQueue.push(elt);

				let width = parseFloat(elt.dataset.width) || 75;
				let height = parseFloat(elt.dataset.height) || 75;

				// Replace the elt with a spinning loader.
				elt.loader = document.createRange().createContextualFragment(`<svg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='${width}pt' height='${height}pt' viewBox='0 0 ${width} ${height}'><rect width='${width}' height='${height}' rx='5pt' ry='5pt' fill='#000' fill-opacity='0.2'/><circle cx="${width / 2}" cy="${height / 2}" r="15" stroke="#f3f3f3" fill="none" stroke-width="3"/><circle cx="${width / 2}" cy="${height / 2}" r="15" stroke="#3498db" fill="none" stroke-width="3" stroke-linecap="round"><animate attributeName="stroke-dasharray" begin="0s" dur="2s" values="56.5 37.7;1 93.2;56.5 37.7" keyTimes="0;0.5;1" repeatCount="indefinite"></animate><animate attributeName="stroke-dashoffset" begin="0s" dur="2s" from="0" to="188.5" repeatCount="indefinite"></animate></circle></svg>`).firstChild;
				elt.replaceWith(elt.loader);
			}
		}

		async function process(elt) {
			let text = elt.childNodes[0].nodeValue;
			let loader = elt.loader;

			// Check for a saved svg again in case this script tag is a duplicate of another.
			let savedSVG = await localForage.getItem(elt.md5hash);

			if (savedSVG) {
				let svg = document.createRange().createContextualFragment(savedSVG).firstChild;
				loader.replaceWith(svg);

				// Emit a bubbling event that the svg is ready.
				const loadFinishedEvent = new Event('tikzjax-load-finished', { bubbles: true});
				svg.dispatchEvent(loadFinishedEvent);

				return;
			}

			let html = "";
			try {
				html = await texWorker.texify(text, Object.assign({}, elt.dataset));
			} catch (err) {
				console.log(err);
				// Show the browser's image not found icon.
				loader.outerHTML = "<img src='//invalid.site/img-not-found.png'/>";
				return;
			}

			let ids = html.match(/\bid="pgf[^"]*"/g);
			if (ids) {
				// Sort the ids from longest to shortest.
				ids.sort((a, b) => { return b.length - a.length; });
				for (let id of ids) {
					let pgfIdString = id.replace(/id="pgf(.*)"/, "$1");
					html = html.replaceAll("pgf" + pgfIdString, `pgf${elt.md5hash}${pgfIdString}`);
				}
			}


			// Patch: Fixes symbols stored in the SOFT HYPHEN character (e.g. \Omega, \otimes) not being rendered
			// Replaces soft hyphens with ¬
			html = html.replaceAll("&#173;", "&#172;");
	

			let svg = document.createRange().createContextualFragment(html).firstChild;
			loader.replaceWith(svg);

			try {
				await localForage.setItem(elt.md5hash, svg.outerHTML);
			} catch (err) {
				console.log(err);
			}

			// Emit a bubbling event that the svg image generation is complete.
			const loadFinishedEvent = new Event('tikzjax-load-finished', { bubbles: true});
			svg.dispatchEvent(loadFinishedEvent);
		};

		// First check the session storage to see if an image is already cached,
		// and if so load that.  Otherwise show a spinning loader, and push the
		// element onto the queue to run tex on.
		for (let element of scripts) {
			await loadCachedOrSetupLoader(element);
		}

		// End here if there is nothing to run tex on.
		if (!texQueue.length) return resolve();

		texWorker = await texWorker;

		processQueue.push(currentProcessPromise);
		if (processQueue.length > 1) {
			await processQueue[processQueue.length - 2];
		}

		// Run tex on the text in each of the scripts that wasn't cached.
		for (let element of texQueue) {
			await process(element);
		}

		processQueue.shift();

		return resolve();
	});
	return currentProcessPromise;
}

function getWorkerFromString(code) {
	window.URL = window.URL || window.webkitURL;

	// "Server response", used in all examples

	var blob;
	try {
		blob = new Blob([code], {type: 'application/javascript'});
	} catch (e) { // Backwards-compatibility
		window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
		blob = new BlobBuilder();
		blob.append(response);
		blob = blob.getBlob();
	}
	var worker = new Worker(URL.createObjectURL(blob)); //, { type: "module" }

	return worker;
}

async function initializeWorker() {

	// Set up the worker thread.
	const tex = await spawn(getWorkerFromString(workerCode));
	Thread.events(tex).subscribe(e => {
		if (e.type == "message" && typeof(e.data) === "string") console.log(e.data);
	});

	// Load the assembly and core dump.
	try {
		await tex.load();
	} catch (err) {
		console.log(err);
	}

	return tex;
}

async function initialize() {
	// Process any text/tikz scripts that are on the page initially.
	processTikzScripts(Array.prototype.slice.call(document.getElementsByTagName('script')).filter(
		(e) => (e.getAttribute('type') === 'text/tikz')
	));

	// If a text/tikz script is added to the page later, then process those.
	observer = new MutationObserver((mutationsList, observer) => {
		let newTikzScripts = [];
		for (const mutation of mutationsList) {
			for (const node of mutation.addedNodes) {
				if (node.tagName && node.tagName.toLowerCase() == 'script' && node.type == "text/tikz")
					newTikzScripts.push(node);
				else if (node.getElementsByTagName)
					newTikzScripts.push.apply(newTikzScripts,
						Array.prototype.slice.call(node.getElementsByTagName('script')).filter(
							(e) => (e.getAttribute('type') === 'text/tikz')
						)
					);
			}
		}
		processTikzScripts(newTikzScripts);
	});
	observer.observe(document.getElementsByTagName('body')[0], { childList: true, subtree: true });
}

async function shutdown() {
	if (observer) observer.disconnect();
	await Thread.terminate(await texWorker);
}

if (!window.TikzJax) {
	window.TikzJax = true;

	localForage.config({ name: 'TikzJax', storeName: 'svgImages' });
	texWorker = initializeWorker();

	if (document.readyState == 'complete') initialize();
	else window.addEventListener('load', initialize);

	// Stop the mutation observer and close the thread when the window is closed.
	window.addEventListener('unload', shutdown);
}
