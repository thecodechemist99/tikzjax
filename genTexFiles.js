var fs = require('fs');
var pako = require('pako');
var spawnSync = require('child_process').spawnSync;

const inputFile = "tex_files.json";

fs.mkdirSync('./tex_files', { recursive: true });

var processedFiles = [];

const files = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

for (const texFile of files) {
	if (!texFile || processedFiles.includes(texFile)) continue;
	console.log(`\tAttempting to locate ${texFile}.`);

	let sysFile = spawnSync('kpsewhich', [texFile]).stdout.toString().trim();
	if (sysFile == '') {
		console.log(`\t\x1b[31mUnable to locate ${texFile}.\x1b[0m`);
		continue;
	}

	processedFiles.push(texFile);

	console.log(`\tResolved ${texFile} to ${sysFile}`);
	fs.writeFileSync('tex_files/' + texFile + ".gz", pako.gzip(fs.readFileSync(sysFile, 'utf8')));
}
