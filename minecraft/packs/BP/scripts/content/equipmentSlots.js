// 装備スロットの定義（保存構造の基準）
// スロットを追加する場合は末尾に追加する。既存のスロットIDは変更しない。

export const EQUIPMENT_SLOTS = Object.freeze([
  { id: "mainHand", name: "武器" },
  { id: "offHand", name: "盾・副武器" },
  { id: "head", name: "頭" },
  { id: "body", name: "胴" },
  { id: "arms", name: "腕" },
  { id: "legs", name: "脚" },
  { id: "feet", name: "足" },
  { id: "accessory1", name: "装飾品1" },
  { id: "accessory2", name: "装飾品2" },
]);

export function emptyEquipmentSlots() {
  const out = {};
  for (const s of EQUIPMENT_SLOTS) out[s.id] = null;
  return out;
}
