const fs = require('fs');

let fontNames = fs.readdirSync('dist/bakoma/ttf/');

const template = `@font-face { font-family: FONTNAME; src: url(data:font/truetype;charset=utf-8;base64,FONTINBASE64) format('truetype'); }
`;

let css = "";

for (const fontName of fontNames) {
    const fontBuffer  = fs.readFileSync("dist/bakoma/ttf/" + fontName);
    const fontInBase64 = fontBuffer.toString('base64');

    css = css + template.replace("FONTNAME", fontName.slice(0, -4)).replace("FONTINBASE64", fontInBase64);
}

fs.writeFileSync('dist/fonts.css', css, {encoding:'utf-8'});
fs.rmdir("dist/bakoma/", { recursive: true }, (err) => { if (err) throw err; });