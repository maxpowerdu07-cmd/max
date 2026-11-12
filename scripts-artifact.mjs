// Turns the single-file build into an artifact page body (the host adds doctype/html/head/body).
// The bundled script itself contains "<head>" and "<body>" strings (the report export builds an
// HTML file), so the document's own tags are found from the outside in: the first <head>, and the
// last </head>, <body> and </body>.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('dist-artifact/index.html', 'utf8');
const h0 = html.indexOf('<head>'), h1 = html.lastIndexOf('</head>');
const b0 = html.lastIndexOf('<body>'), b1 = html.lastIndexOf('</body>');
if (h0 < 0 || h1 < h0 || b0 < h1 || b1 < b0) throw new Error('Unexpected build layout');
const head = html.slice(h0 + 6, h1).replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = html.slice(b0 + 6, b1);
if (!body.includes('id="root"')) throw new Error('Root element missing from the extracted body');
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/drydock-safety-ios.html', head.trim() + '\n' + body.trim() + '\n');
console.log('artifact/drydock-safety-ios.html', (html.length / 1024).toFixed(0) + ' KB');
