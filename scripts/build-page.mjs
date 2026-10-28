// Claude のページ（ひとり用＋みんなで遊ぶ版）として出すファイルを、出力先のフォルダにまとめる
//   node scripts/build-page.mjs <出力先>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || 'page-build');
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['shared', 'server']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const copy = (from, to = from) => fs.copyFileSync(path.join(ROOT, from), path.join(OUT, to));
copy('public/app.js', 'app.js');
copy('public/local.js', 'local.js');
copy('public/shared.js', 'shared.js');
copy('public/style.css', 'style.css');
for (const f of ['data.js', 'battlecore.js', 'skills.js']) copy('shared/' + f);
for (const f of ['game.js', 'battle.js', 'events.js', 'incidents.js', 'ai.js', 'demonai.js']) copy('server/' + f);
const src = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const body = src.slice(src.indexOf('<div id="app">'), src.indexOf('<script type="module"'));
fs.writeFileSync(path.join(OUT, 'index.html'), `<title>山羊の野望</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600;800&display=swap">
<link rel="stylesheet" href="style.css">
${body}<script>window.YAGI_LOCAL = true;</script>
<script type="module" src="app.js"></script>
`);
console.log('できました：', OUT);
