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
var processQueue = [];
var observer = null;
var texWorker;

async function process(scripts) {
	let currentProcessPromise = new Promise(async function(resolve, reject) {
		let texQueue = [];

		async function loadCachedOrSetupLoader(elt) {
			let div = document.createElement('div');
			elt.replaceWith(div);
			elt.div = div;

			// Transfer any classes set for the script element to the new div.
			div.classList = elt.classList;
			div.classList.add("tikzjax-container");

			elt.md5hash = md5(JSON.stringify(elt.dataset) + elt.childNodes[0].nodeValue);

			let savedSVG = await localForage.getItem(elt.md5hash);

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
				dvi = await texWorker.texify(text, Object.assign({}, elt.dataset));
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

			let ids = html.match(/\bid="[^"]*"/g);
			if (ids) {
				// Sort the ids from longest to shortest.
				ids.sort((a, b) => { return b.length - a.length; });
				for (let id of ids) {
					let pgfIdString = id.replace(/id="pgf(.*)"/, "$1");
					html = html.replaceAll("pgf" + pgfIdString, `pgf${elt.md5hash}${pgfIdString}`);
				}
			}
			div.innerHTML = html;

			let svg = div.getElementsByTagName('svg');
			svg[0].style.width = '100%';
			svg[0].style.height = '100%';

			try {
				await localForage.setItem(elt.md5hash, div.innerHTML);
			} catch (err) {
				console.log(err);
			}

			// Emit a bubbling event that the svg image generation is complete.
			const loadFinishedEvent = new Event('tikzjax-load-finished', { bubbles: true});
			div.dispatchEvent(loadFinishedEvent);
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

		// Hack to keep the worker thread alive in Firefox.
		let queryInterval = setInterval(async () => await texWorker.queryStatus(), 1000);

		processQueue.push(currentProcessPromise);
		if (processQueue.length > 1) {
			await processQueue[processQueue.length - 2];
		}

		// Run tex on the text in each of the scripts that wasn't cached.
		for (let element of texQueue) {
			await process(element);
		}

		clearInterval(queryInterval);

		processQueue.shift();

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

async function initialize() {
	// Process any text/tikz scripts that are on the page initially.
	process(Array.prototype.slice.call(document.getElementsByTagName('script')).filter(
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
		process(newTikzScripts);
	});
	observer.observe(document.getElementsByTagName('body')[0], { childList: true, subtree: true });
}

async function shutdown() {
	if (observer) observer.disconnect();
	await Thread.terminate(texWorker);
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
