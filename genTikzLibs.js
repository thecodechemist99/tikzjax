var fs = require('fs');
var pako = require('pako');

var libsFiles = fs.readdirSync('lib_filelists');

fs.mkdirSync('./dist/libs', { recursive: true });

for (const libFile of libsFiles) {
	let filelist = fs.readFileSync('lib_filelists/' + libFile, 'utf8');
	let files = JSON.parse(filelist);

	let filesystem = {};

	for (const [basename, file] of Object.entries(files)) {
		if (!basename || !file) continue;
		filesystem[basename] = fs.readFileSync(file, 'utf8');
	}

	fs.writeFileSync('dist/libs/' + libFile + ".gz", pako.gzip(JSON.stringify(filesystem)));
}
