var fs = require('fs');
var pako = require('pako');

const packages_dir = 'packages';

var packagesFiles = fs.readdirSync(packages_dir);

fs.mkdirSync('./dist/' + packages_dir, { recursive: true });

for (const packageFile of packagesFiles) {
	let filelist = fs.readFileSync(packages_dir + '/' + packageFile, 'utf8');
	let files = JSON.parse(filelist);

	let filesystem = {};

	for (const [basename, file] of Object.entries(files)) {
		if (!basename || !file) continue;
		filesystem[basename] = fs.readFileSync(file, 'utf8');
	}

	fs.writeFileSync('dist/' + packages_dir + '/' + packageFile + ".gz", pako.gzip(JSON.stringify(filesystem)));
}
