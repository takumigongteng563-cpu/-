// 才能の等級（低い順）
export const GRADES = Object.freeze([
  { id: "F", name: "一般", color: "§7" },
  { id: "E", name: "下級", color: "§f" },
  { id: "D", name: "中級", color: "§a" },
  { id: "C", name: "上級", color: "§b" },
  { id: "B", name: "希少", color: "§9" },
  { id: "A", name: "英雄", color: "§d" },
  { id: "S", name: "伝説", color: "§6" },
  { id: "SS", name: "神話", color: "§c" },
  { id: "SSS", name: "神級", color: "§e" },
  { id: "EX", name: "規格外", color: "§5" },
]);

const ORDER = new Map(GRADES.map((g, i) => [g.id, i]));

export function gradeIndex(id) {
  return ORDER.has(id) ? ORDER.get(id) : -1;
}

export function gradeInfo(id) {
  return GRADES[gradeIndex(id)] ?? { id, name: "?", color: "§7" };
}

/** 例: "§aD§r" */
export function gradeLabel(id) {
  const g = gradeInfo(id);
  return `${g.color}[${g.id}]§r`;
}
