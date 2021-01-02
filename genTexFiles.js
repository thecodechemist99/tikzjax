var fs = require('fs');
var pako = require('pako');
var spawnSync = require('child_process').spawnSync;

const inputDirs = ['packages', 'tikz_libs'];

function locateSystemTexFile(filename) {
	let sysFile = spawnSync('kpsewhich', [filename]).stdout.toString().trim();

	// Tex requests some tikz library files with the name
	// tikzlibrary<libname>.code.tex.  However, the actual file on the system is
	// pgflibrary<libname>.code.tex.  Somehow latex and pdflatex resolve this to the
	// correct file, but tex/etex do not.  This attempts to deal with that.
	if (sysFile == '' && filename.startsWith('tikzlibrary'))
		sysFile = spawnSync('kpsewhich', [filename.replace(/^tikzlibrary/, "pgflibrary")]).stdout.toString().trim();

	if (sysFile == '') {
		// If the file still was not located, try with the basename.
		let basename = filename.slice(filename.lastIndexOf('/') + 1);
		sysFile = spawnSync('kpsewhich', [basename]).stdout.toString().trim();
	}

	return sysFile;
}

fs.mkdirSync('./dist/tex_files', { recursive: true });

var processedFiles = [];

for (const inputDir of inputDirs) {
	const jsonFiles = fs.readdirSync(inputDir);

	fs.mkdirSync('./dist/' + inputDir, { recursive: true });

	for (const fileListFile of jsonFiles) {
		console.log(`Processing ${inputDir}/${fileListFile}`);
		const files = JSON.parse(fs.readFileSync(inputDir + '/' + fileListFile, 'utf8'));

		let filesystem = {};

		for (const texFileName of files) {
			if (!texFileName || processedFiles.includes(texFileName)) continue;
			console.log(`\tAttempting to locate ${texFileName}.`);

			let sysFile = locateSystemTexFile(texFileName);

			if (sysFile == '') {
				console.log(`\t\x1b[31mUnable to locate ${texFileName}.\x1b[0m`);
				continue;
			}

			processedFiles.push(texFileName);

			console.log(`\tResolved ${texFileName} to ${sysFile}`);
			fs.writeFileSync('dist/tex_files/' + texFileName + ".gz", pako.gzip(fs.readFileSync(sysFile, 'utf8')));
		}

		fs.writeFileSync('dist/' + inputDir + '/' + fileListFile, JSON.stringify(files));
	}
}
