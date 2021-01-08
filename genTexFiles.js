var fs = require('fs');
var pako = require('pako');
var spawnSync = require('child_process').spawnSync;

const inputDirs = ['tex_packages', 'tikz_libs'];

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

			let sysFile = spawnSync('kpsewhich', [texFileName]).stdout.toString().trim();
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
