const fs = require('fs');

// Delete unused files after the build of TikzJax is complete
try {
    fs.unlinkSync("dist/run-tex-output.js");
    fs.unlinkSync("dist/run-tex-output.map");
}
catch {

}