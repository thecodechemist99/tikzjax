var fs = require('fs');
var pako = require('pako');

const tikz_libs_dir = 'tikz_libs';

var libsFiles = fs.readdirSync(tikz_libs_dir);

fs.mkdirSync('./dist/' + tikz_libs_dir, { recursive: true });

for (const libFile of libsFiles) {
	let filelist = fs.readFileSync(tikz_libs_dir + '/' + libFile, 'utf8');
	let files = JSON.parse(filelist);

	let filesystem = {};

	for (const [basename, file] of Object.entries(files)) {
		if (!basename || !file) continue;
		filesystem[basename] = fs.readFileSync(file, 'utf8');
	}

	fs.writeFileSync('dist/' + tikz_libs_dir + '/' + libFile + ".gz", pako.gzip(JSON.stringify(filesystem)));
}
