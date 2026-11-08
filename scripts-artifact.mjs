// Turns the single-file build into an artifact page body (the host adds doctype/html/head/body).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('dist-artifact/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/drydock-safety-ios.html', head.trim() + '\n<style>:root{color-scheme:dark;background:#0a0b0d}body{background:#0a0b0d;color:#f2f4f6}</style>\n' + body.trim() + '\n');
console.log('artifact/drydock-safety-ios.html', (html.length / 1024).toFixed(0) + ' KB');
