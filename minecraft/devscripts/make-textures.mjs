// アイコン画像を生成する（ドット絵をコードで定義）。
// 実行: node devscripts/make-textures.mjs
import fs from "node:fs";
import { encodePng } from "./png.mjs";

// 冒険者の書（16x16）
const BOOK = [
  "................",
  "..############..",
  ".#RRRRRRRRRRRR#.",
  ".#RYYYYYYYYYYR#W",
  ".#RYRRRRRRRRYR#W",
  ".#RYRRGGGRRRYR#W",
  ".#RYRGGRGGRRYR#W",
  ".#RYRGRRRGRRYR#W",
  ".#RYRGGRGGRRYR#W",
  ".#RYRRGGGRRRYR#W",
  ".#RYRRRGRRRRYR#W",
  ".#RYRRRRRRRRYR#W",
  ".#RYYYYYYYYYYR#W",
  ".#RRRRRRRRRRRR#W",
  "..############WW",
  "................",
];
const PAL = {
  ".": [0, 0, 0, 0],
  "#": [43, 20, 12, 255],
  R: [128, 32, 36, 255],
  Y: [222, 178, 60, 255],
  G: [250, 222, 110, 255],
  W: [236, 228, 206, 255],
};

function fromArt(art, scale = 1) {
  const n = art.length;
  return encodePng(n * scale, n * scale, (x, y) => PAL[art[Math.floor(y / scale)][Math.floor(x / scale)]]);
}

fs.writeFileSync("packs/RP/textures/items/adventurer_book.png", fromArt(BOOK));

// パックアイコン（128x128）：夜空のグラデーション + 書のドット絵
function packIcon(accent) {
  return encodePng(128, 128, (x, y) => {
    const bx = Math.floor((x - 16) / 6);
    const by = Math.floor((y - 16) / 6);
    if (bx >= 0 && bx < 16 && by >= 0 && by < 16) {
      const c = PAL[BOOK[by][bx]];
      if (c[3] > 0) return c;
    }
    const t = y / 127;
    return [Math.round(20 + 40 * t), Math.round(12 + 10 * t), Math.round(48 + 40 * (1 - t)) + accent, 255];
  });
}
fs.writeFileSync("packs/BP/pack_icon.png", packIcon(0));
fs.writeFileSync("packs/RP/pack_icon.png", packIcon(40));
console.log("textures written");
