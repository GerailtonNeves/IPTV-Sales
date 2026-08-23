const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const indexPath = path.join(publicDir, 'index.html');

let html = fs.readFileSync(indexPath, 'utf8');

// Se houver script tag duplo ao final, limpar para <script src="js/app.js"></script>
const bodyIdx = html.indexOf('<body');
if (bodyIdx !== -1) {
  let bodyContent = html.substring(bodyIdx);
  
  // Limpar qualquer bloco <script> de JS inlined antigo ao final do body
  const scriptIdx = bodyContent.lastIndexOf('<script');
  if (scriptIdx !== -1) {
    bodyContent = bodyContent.substring(0, scriptIdx) + '<script src="js/app.js"></script>\n</body>\n</html>';
  }

  const headHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPTV Premium Digital - Painel de Controle</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0284c7">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="css/style.css">
</head>
`;

  fs.writeFileSync(indexPath, headHtml + bodyContent);
  console.log('✅ index.html restaurado limpo!');
}
