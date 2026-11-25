// パック構成の静的検証
//  ・JSON の構文
//  ・manifest の UUID 形式・重複・BP/RP の相互依存とバージョン一致
//  ・スクリプトの import 先が実在するか（統合版は拡張子付きの正確なパスが必要）
//  ・使用モジュールが manifest の依存と一致するか
//  ・アイテムのアイコン・テクスチャ・言語キーの対応
import fs from "node:fs";
import path from "node:path";

const errors = [];
const err = (m) => errors.push(m);
const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    err(`JSON構文エラー: ${p}: ${e.message}`);
    return null;
  }
};
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

const BP = "packs/BP";
const RP = "packs/RP";
for (const f of [...walk(BP), ...walk(RP)]) {
  if (f.endsWith(".json")) readJson(f);
  if (/[^\x20-\x7e]/.test(f)) err(`ファイル名にASCII以外の文字: ${f}`);
}

const bpm = readJson(`${BP}/manifest.json`);
const rpm = readJson(`${RP}/manifest.json`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuids = [bpm.header.uuid, rpm.header.uuid, ...bpm.modules.map((m) => m.uuid), ...rpm.modules.map((m) => m.uuid)];
for (const u of uuids) if (!UUID.test(u)) err(`UUID形式不正: ${u}`);
if (new Set(uuids).size !== uuids.length) err("UUIDが重複しています");
const dep = (m, uuid) => m.dependencies.find((d) => d.uuid === uuid);
if (!dep(bpm, rpm.header.uuid)) err("BP が RP に依存していません");
else if (dep(bpm, rpm.header.uuid).version.join(".") !== rpm.header.version.join(".")) err("BP→RP 依存バージョン不一致");
if (!dep(rpm, bpm.header.uuid)) err("RP が BP に依存していません");
else if (dep(rpm, bpm.header.uuid).version.join(".") !== bpm.header.version.join(".")) err("RP→BP 依存バージョン不一致");

const pkg = readJson("package.json");
const scriptMod = bpm.modules.find((m) => m.type === "script");
const entry = path.join(BP, scriptMod.entry);
if (!fs.existsSync(entry)) err(`スクリプトのエントリが存在しません: ${entry}`);
const declared = Object.fromEntries(bpm.dependencies.filter((d) => d.module_name).map((d) => [d.module_name, d.version]));
for (const [name, ver] of Object.entries(declared)) {
  if (pkg.devDependencies[name] !== ver) err(`${name}: manifest ${ver} と 型定義 ${pkg.devDependencies[name]} が不一致`);
}

// import 解析
const scripts = walk(path.join(BP, "scripts")).filter((f) => f.endsWith(".js"));
const reachable = new Set();
const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
function visit(file) {
  if (reachable.has(file)) return;
  reachable.add(file);
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(IMPORT)) {
    const spec = m[1] || m[2];
    if (spec.startsWith(".")) {
      const target = path.normalize(path.join(path.dirname(file), spec));
      if (!spec.endsWith(".js")) err(`${file}: import に拡張子 .js がありません: ${spec}`);
      if (!fs.existsSync(target)) err(`${file}: import 先が存在しません: ${spec}`);
      else visit(target);
    } else if (!declared[spec]) {
      err(`${file}: manifest に無いモジュールを import: ${spec}`);
    }
  }
}
visit(entry);
for (const f of scripts) if (!reachable.has(f)) err(`どこからも読み込まれていないスクリプト: ${f}`);

// アイテム・テクスチャ・言語
const itemTex = readJson(`${RP}/textures/item_texture.json`);
const langs = Object.fromEntries(
  ["ja_JP", "en_US"].map((l) => [l, fs.readFileSync(`${RP}/texts/${l}.lang`, "utf8").split(/\r?\n/).map((x) => x.split("=")[0])])
);
for (const f of walk(path.join(BP, "items"))) {
  const j = readJson(f);
  const c = j["minecraft:item"].components;
  const icon = c["minecraft:icon"]?.textures?.default;
  const tex = itemTex.texture_data[icon];
  if (!tex) err(`${f}: アイコン ${icon} が item_texture.json に無い`);
  else if (!fs.existsSync(path.join(RP, tex.textures + ".png"))) err(`${f}: テクスチャ画像が無い: ${tex.textures}.png`);
  const key = c["minecraft:display_name"]?.value;
  for (const [l, keys] of Object.entries(langs)) if (!keys.includes(key)) err(`${f}: 言語キー ${key} が ${l}.lang に無い`);
}
for (const p of [`${BP}/pack_icon.png`, `${RP}/pack_icon.png`]) if (!fs.existsSync(p)) err(`アイコンが無い: ${p}`);

if (errors.length) {
  console.error("検証エラー:\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log(`パック検証OK（スクリプト ${reachable.size} ファイル、UUID ${uuids.length} 個）`);
