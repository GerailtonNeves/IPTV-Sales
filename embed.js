const fs = require('fs');
const path = require('path');

const root = __dirname;
const publicDir = path.join(root, 'public');

let indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(publicDir, 'css', 'style.css'), 'utf8');
const jsContent = fs.readFileSync(path.join(publicDir, 'js', 'app.js'), 'utf8');

if (indexHtml.includes('css/style.css')) {
  indexHtml = indexHtml.replace('<link rel="stylesheet" href="css/style.css">', `<style>\n${cssContent}\n</style>`);
}

if (indexHtml.includes('js/app.js')) {
  indexHtml = indexHtml.replace('<script src="js/app.js"></script>', `<script>\n${jsContent}\n</script>`);
}

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);
fs.writeFileSync(path.join(root, 'dashboard_html.js'), 'module.exports = ' + JSON.stringify(indexHtml) + ';');

console.log('✅ HTML, CSS e JS 100% EMBUTIDOS EM UM ÚNICO ARQUIVO COM SUCESSO!');
