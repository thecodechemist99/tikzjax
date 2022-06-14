const fs = require('fs');

// Add TeX package files
let files = fs.readdirSync('tex_files/');
files = files.map(value => "tex_files/" + value);

// Add core.dump and tex.wasm
files.unshift("core.dump.gz", "tex.wasm.gz");


let texFilesBase64 = {};

for (let file of files) {
    if (!file.endsWith(".gz")) continue;
    console.log(file);

    const fileBuffer  = fs.readFileSync(file);
    const gzippedStringInBase64 = fileBuffer.toString('base64');

    texFilesBase64[file] = gzippedStringInBase64;
}


fs.writeFileSync('tex_files/texFilesBase64.js', "export const texFilesBase64 = " + JSON.stringify(texFilesBase64) + ";", {encoding:'utf-8'});