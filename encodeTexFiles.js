const fs = require('fs');

// Add TeX package files
let files = fs.readdirSync('tex_files/').filter(el => el.endsWith(".gz"));
files = files.map(value => "tex_files/" + value);

// Add core.dump and tex.wasm
files.unshift("core.dump.gz", "tex.wasm.gz");


// Create a dictionary with the file paths as keys, and variable names as values
// Remove invalid chars (-, ., /) from variable names
filesDict = Object.fromEntries( files.map( x => [x, x.replace(/[-\.\/]/g, "_")]) );


// Create list of imports
const imports = Object.keys(filesDict).reduce(function (previous, key) {
    return previous + `import ${filesDict[key]} from "./../${key}";\n`;
}, "");


// Create the dictionary string
const dict = Object.entries(filesDict).map(([key, value]) => `"${key}":${value}`);

const output = imports + "export const texFilesBase64 = {" + dict.join(",") + "}";

fs.writeFileSync('tex_files/texFilesBase64.js', output, {encoding:'utf-8'});