import { tfmData } from 'dvi2html';
import { Buffer } from 'buffer';

////////////////////////////////////////////////////////////

type BaseFile = {
	eoln?: boolean,
	eof?: boolean,
	descriptor?: number,
	position?: number,
	position2?: number,
};

type FileStdIn = BaseFile & {
	filename: "stdin"
	stdin: true,
	erstat: 0,
	content?: Buffer
}

type FileStdOut = BaseFile & {
	filename: "stdout"
	stdout: true,
	erstat: 0
}

type FileRegular = BaseFile & {
	filename: string,
	erstat: 0,
	content: Uint8Array|Buffer
}

type FileNoError = FileStdIn | FileStdOut | FileRegular;

type FileWithError = {
	filename: string,
	erstat: 1
}

type File = FileNoError | FileWithError;

function fileIsStdIn(file: FileNoError | { stdin: boolean }): file is FileStdIn {
	if((file as any).stdin) { return true;  }
	else                    { return false; }
}

function fileIsStdOut(file: FileNoError | { stdout: boolean }): file is FileStdOut {
	if((file as any).stdout) { return true;  }
	else                     { return false; }
}


/* ------------------------------------------------------ */

type WasmExports = WebAssembly.Exports & {
	main(): unknown,
	asyncify_start_unwind(x: number): unknown
	asyncify_stop_unwind(): unknown
	asyncify_start_rewind(x: number): unknown
	asyncify_stop_rewind(): unknown
}

////////////////////////////////////////////////////////////

var filesystem               = {};
var files: File[]            = [];
var showConsole: boolean     = false;
var consoleBuffer: string    = "";
var memory: ArrayBufferLike  = null;
var inputBuffer: string|null = null;
var callback                 = null;
let wasmExports: WasmExports = null;
let view: Int32Array|null    = null;
var finished                 = null;

let fileLoader: (name:string) => Promise<Uint8Array> = null;

export var pages: number = 1100;

let DATA_ADDR: number    = (pages - 100) * 1024 * 64;
let END_ADDR: number     = pages * 1024 * 64;
let windingDepth: number = 0;
let sleeping: boolean    = false;

function startUnwind() {
	if (view) {
		view[DATA_ADDR >> 2] = DATA_ADDR + 8;
		view[DATA_ADDR + 4 >> 2] = END_ADDR;
	}

	wasmExports.asyncify_start_unwind(DATA_ADDR);
	windingDepth = windingDepth + 1;
}

function startRewind() {
	wasmExports.asyncify_start_rewind(DATA_ADDR);
	wasmExports.main();
}

function stopRewind() {
	windingDepth = windingDepth - 1;
	wasmExports.asyncify_stop_rewind();
}

function deferredPromise() {
	let _resolve, _reject;

	let promise = new Promise((resolve, reject) => {
		_resolve = resolve;
		_reject = reject;
	});
	(promise as any).resolve = _resolve;
	(promise as any).reject = _reject;

	return promise;
}

export function deleteEverything() {
	files = [];
	filesystem = {};
	memory = null;
	inputBuffer = null;
	callback = null;
	showConsole = false;
	finished = null;
	wasmExports = null;
	view = null;
	sleeping = false;
}

export function writeFileSync(filename: string, buffer: Buffer)
{
	filesystem[filename] = buffer;
}

export function readFileSync(filename: string)
{
	for (let f of files) {
		let file = f as FileRegular;
		if (file.filename == filename) {
			return file.content.slice(0, file.position);
		}
	}

	throw Error(`Could not find file ${filename}`);
}

function openSync(filename: string, mode: "r"|"w"): number {
	let initialSleepState = sleeping;
	if (sleeping) {
		stopRewind();
		sleeping = false;
	}

	let buffer = new Uint8Array();

	if (filesystem[filename]) {
		buffer = filesystem[filename];
	} else if (filename.match(/\.tfm$/)) {
		buffer = Uint8Array.from(tfmData(filename.replace(/\.tfm$/, '')));
	} else if (mode == "r") {
		// If this file has been opened before without an error, that means it was written to.
		// In that case assume the file can now be opened, so fall through and create a fake file below.
		// Otherwise attempt to find it.
		let descriptor = files.findIndex(element => element.filename == filename && !element.erstat);
		if (descriptor == -1) {
			if (initialSleepState || filename.match(/\.(aux|log|dvi)$/)) {
				// If we are returning from sleep and the file is still not in the filesystem,
				// or it is an aux, log, or dvi file, then report it as not found.
				files.push({
					filename: filename,
					erstat: 1
				});
				return files.length - 1;
			} else {
				// Pause the web assembly execution, and attempt to load the file.
				startUnwind();
				sleeping = true;
				setTimeout(async () => {
					// Attempt to load the file.
					try {
						let data = await fileLoader(`tex_files/${filename}.gz`);
						filesystem[filename] = data;
					} catch (e) {}
					startRewind();
				}, 0);
				return -1;
			}
		}
	}

	files.push({
		filename: filename,
		position: 0,
		position2: 0,
		erstat: 0,
		eoln: false,
		content: buffer,
		descriptor: files.length
	});

	return files.length - 1;
}

function closeSync(fd) {
	// ignore this.
}

function writeSync(file: FileRegular, buffer, pointer?: number, length?: number): void {
	if (pointer === undefined) pointer = 0;
	if (length === undefined) length = buffer.length - pointer;

	while (length > file.content.length - file.position) {
		let b = new Uint8Array(1 + file.content.length * 2);
		b.set(file.content);
		file.content = b;
	}

	file.content.subarray(file.position).set(buffer.subarray(pointer, pointer+length));
	file.position += length;
}

function readSync(file: FileRegular, buffer: Uint8Array, pointer: number|undefined, length: number|undefined, seek: number): number {
	if (pointer === undefined) pointer = 0;
	if (length === undefined) length = buffer.length - pointer;

	if (length > file.content.length - seek)
		length = file.content.length - seek;

	buffer.subarray(pointer).set(file.content.subarray(seek, seek+length));

	return length;
}

function writeToConsole(x: string) {
	if (!showConsole) return;
	consoleBuffer += x;
	if (consoleBuffer.indexOf("\n") >= 0) {
		let lines = consoleBuffer.split("\n");
		consoleBuffer = lines.pop();
		for (let line of lines) {
			if (line.length) postMessage(line);
		}
	}
}

export function setShowConsole() {
	showConsole = true;
}

// setup

export function setMemory(m: ArrayBufferLike) {
	memory = m;
	view = new Int32Array(m);
}

export function setInput(input: string, cb?: unknown) {
	inputBuffer = input;
	if (cb) callback = cb;
}

export function setFileLoader(c: (name:string) => Promise<Uint8Array>) {
	fileLoader = c;
}

export async function executeAsync(_wasmExports: WebAssembly.Exports) {
	wasmExports = _wasmExports as WasmExports;

	finished = deferredPromise();

	wasmExports.main();
	wasmExports.asyncify_stop_unwind();

	return finished;
}

// provide time back to tex

export function getCurrentMinutes() {
	var d = (new Date());
	return 60 * (d.getHours()) + d.getMinutes();
}

export function getCurrentDay() {
	return (new Date()).getDate();
}

export function getCurrentMonth() {
	return (new Date()).getMonth() + 1;
}

export function getCurrentYear() {
	return (new Date()).getFullYear();
}

// print

export function printString(descriptor: number, x: number) {
	var file = (descriptor < 0) ? { stdout: true } : files[descriptor] as FileNoError;
	var length = new Uint8Array(memory, x, 1)[0];
	var buffer = new Uint8Array(memory, x + 1, length);
	var string = String.fromCharCode.apply(null, buffer);

	if (fileIsStdOut(file)) {
		writeToConsole(string);
		return;
	}

	writeSync(file as FileRegular, Buffer.from(string));
}

export function printBoolean(descriptor: number, x: unknown) {
	var file = (descriptor < 0) ? { stdout: true } : files[descriptor] as FileNoError;

	var result = x ? "TRUE" : "FALSE";

	if (fileIsStdOut(file)) {
		writeToConsole(result);
		return;
	}

	writeSync(file as FileRegular, Buffer.from(result));
}

export function printChar(descriptor: number, x: number) {
	var file = (descriptor < 0) ? { stdout: true } : files[descriptor] as FileNoError;
	if (fileIsStdOut(file)) {
		writeToConsole(String.fromCharCode(x));
		return;
	}

	var b = Buffer.alloc(1);
	b[0] = x;
	writeSync(file as FileRegular, b);
}

export function printInteger(descriptor: number, x: number) {
	var file = (descriptor < 0) ? { stdout: true } : files[descriptor] as FileRegular;
	if (fileIsStdOut(file)) {
		writeToConsole(x.toString());
		return;
	}

	writeSync(file as FileRegular, Buffer.from(x.toString()));
}

export function printFloat(descriptor: number, x: number) {
	var file = (descriptor < 0) ? { stdout: true } : files[descriptor] as FileRegular;
	if (fileIsStdOut(file)) {
		writeToConsole(x.toString());
		return;
	}

	writeSync(file as FileRegular, Buffer.from(x.toString()));
}

export function printNewline(descriptor: number, x: number) {
	var file = (descriptor < 0) ? { stdout: true } : files[descriptor] as FileNoError;

	if (fileIsStdOut(file)) {
		writeToConsole("\n");
		return;
	}

	writeSync(file as FileRegular, Buffer.from("\n"));
}

export function reset(length?: number, pointer?: number) {
	var buffer = new Uint8Array(memory, pointer, length);
	var filename = String.fromCharCode.apply(null, buffer);

	filename = filename.replace(/\000+$/g,'');

	if (filename.startsWith('{')) {
		filename = filename.replace(/^{/g, '');
		filename = filename.replace(/}.*/g, '');
	}

	if (filename.startsWith('"')) {
		filename = filename.replace(/^"/g, '');
		filename = filename.replace(/".*/g, '');
	}

	filename = filename.replace(/ +$/g, '');
	filename = filename.replace(/^\*/, '');
	filename = filename.replace(/^TeXfonts:/, '');

	if (filename == 'TeXformats:TEX.POOL')
		filename = "tex.pool";

	if (filename == "TTY:") {
		files.push({
			filename: "stdin",
			stdin: true,
			position: 0,
			position2: 0,
			erstat: 0,
			eoln: false,
			content: Buffer.from(inputBuffer)
		});
		return files.length - 1;
	}

	return openSync(filename, 'r');
}

export function rewrite(length, pointer) {
	var buffer = new Uint8Array(memory, pointer, length);
	var filename = String.fromCharCode.apply(null, buffer);

	filename = filename.replace(/ +$/g, '');

	if (filename.startsWith('"')) {
		filename = filename.replace(/^"/g, '');
		filename = filename.replace(/".*/g, '');
	}

	if (filename == "TTY:") {
		files.push({
			filename: "stdout",
			stdout: true,
			erstat: 0,
		});
		return files.length - 1;
	}

	return openSync(filename, 'w');
}

export function close(descriptor: number) {
	var file = files[descriptor] as FileNoError;

	if (file.descriptor)
		closeSync(file.descriptor);
}

export function eof(descriptor: number) {
	var file = files[descriptor] as FileNoError;

	if (file.eof) return 1;
	else return 0;
}

export function erstat(descriptor: number) {
	var file = files[descriptor] as FileNoError;
	return file.erstat;
}

export function eoln(descriptor: number) {
	var file = files[descriptor] as FileNoError;

	if (file.eoln) return 1;
	else return 0;
}

export function inputln(
	descriptor: number,
	bypass_eoln: boolean,
	bufferp?: number,
	firstp?: number,
	lastp?: number,
	max_buf_stackp?: number,
	buf_size?: number
) {
	var file = files[descriptor] as FileRegular;
	var last_nonblank = 0; // |last| with trailing blanks removed

	var buffer = new Uint8Array(memory, bufferp, buf_size);
	var first = new Uint32Array(memory, firstp, 4);
	var last = new Uint32Array(memory, lastp, 4);
	var max_buf_stack = new Uint32Array(memory, max_buf_stackp, 4);

	// cf. Matthew 19:30
	last[0] = first[0];

	// Input the first character of the line into |f^|
	if (bypass_eoln && !file.eof && file.eoln) {
		file.position2 = file.position2 + 1;
	}

	let endOfLine = file.content.indexOf(10, file.position2);
	if (endOfLine < 0) endOfLine = file.content.length;

	if (file.position2 >= file.content.length) {
		if (fileIsStdIn(file)) {
			if (callback) callback();
			tex_final_end();
		}

		file.eof = true;
		return false;
	} else {
		buffer.subarray(first[0]).set(file.content.subarray(file.position2, endOfLine));

		last[0] = first[0] + endOfLine - file.position2;

		while (buffer[last[0] - 1] == 32)
			last[0] = last[0] - 1;

		file.position2 = endOfLine;
		file.eoln = true;
	}

	return true;
}

export function get(descriptor: number, pointer, length) {
	var file = files[descriptor] as FileNoError;

	var buffer = new Uint8Array(memory);

	if (fileIsStdIn(file)) {
		if (file.position >= inputBuffer.length) {
			buffer[pointer] = 13;
			file.eof = true;
			if (callback) callback();
			tex_final_end();
		} else
			buffer[pointer] = inputBuffer[file.position].charCodeAt(0);
	} else {
		if (file.descriptor) {
			if (readSync(file as FileRegular, buffer, pointer, length, file.position) == 0) {
				buffer[pointer] = 0;
				file.eof = true;
				file.eoln = true;
				return;
			}
		} else {
			file.eof = true;
			file.eoln = true;
			return;
		}
	}

	file.eoln = false;
	if (buffer[pointer] == 10) file.eoln = true;
	if (buffer[pointer] == 13) file.eoln = true;

	file.position = file.position + length;
}

export function put(descriptor, pointer, length) {
	var file = files[descriptor];

	var buffer = new Uint8Array(memory);

	writeSync(file as FileRegular, buffer, pointer, length);
}

export function tex_final_end() {
	if (consoleBuffer.length) writeToConsole("\n");
	if (finished) finished.resolve();
}
