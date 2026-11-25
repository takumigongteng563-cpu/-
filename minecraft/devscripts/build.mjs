// 配布ファイルを作成する
//   dist/MajinNoguchi_v<ver>.mcaddon   … BP と RP をまとめたもの（ダブルクリックで導入）
//   dist/MajinNoguchi_BP_v<ver>.mcpack / MajinNoguchi_RP_v<ver>.mcpack … 個別導入用
import fs from "node:fs";
import path from "node:path";
import { createZip } from "./zip.mjs";

const bpm = JSON.parse(fs.readFileSync("packs/BP/manifest.json", "utf8"));
const ver = bpm.header.version.join(".");

function collect(dir, prefix) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...collect(p, `${prefix}${d.name}/`));
    else out.push({ name: `${prefix}${d.name}`, data: fs.readFileSync(p) });
  }
  return out;
}

fs.mkdirSync("dist", { recursive: true });
for (const f of fs.readdirSync("dist")) if (/\.(mcaddon|mcpack)$/.test(f)) fs.rmSync(path.join("dist", f));
const bp = collect("packs/BP", "MajinNoguchi_BP/");
const rp = collect("packs/RP", "MajinNoguchi_RP/");
const outputs = {
  [`MajinNoguchi_v${ver}.mcaddon`]: [...bp, ...rp],
  [`MajinNoguchi_BP_v${ver}.mcpack`]: collect("packs/BP", ""),
  [`MajinNoguchi_RP_v${ver}.mcpack`]: collect("packs/RP", ""),
};
for (const [name, files] of Object.entries(outputs)) {
  const buf = createZip(files);
  fs.writeFileSync(path.join("dist", name), buf);
  console.log(`dist/${name}  (${files.length} files, ${buf.length} bytes)`);
}
