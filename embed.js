const fs = require('fs');
const path = require('path');

const root = __dirname;
const publicDir = path.join(root, 'public');

const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(publicDir, 'css', 'style.css'), 'utf8');
const jsContent = fs.readFileSync(path.join(publicDir, 'js', 'app.js'), 'utf8');

fs.writeFileSync(path.join(root, 'dashboard_html.js'), 'module.exports = ' + JSON.stringify(indexHtml) + ';', 'utf8');
fs.writeFileSync(path.join(root, 'js_app_bundle.js'), 'module.exports = ' + JSON.stringify(jsContent) + ';', 'utf8');
fs.writeFileSync(path.join(root, 'css_style_bundle.js'), 'module.exports = ' + JSON.stringify(cssContent) + ';', 'utf8');

console.log('✅ Bundles gerados com sucesso com suporte UTF-8!');
