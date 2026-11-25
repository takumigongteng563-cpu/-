// 才能レジストリ（初期・進化・後天性をまとめて登録）
import { Registry } from "../registry.js";
import { INNATE_TALENTS } from "./innate.js";
import { EVOLVED_TALENTS } from "./evolved.js";
import { ACQUIRED_TALENTS } from "./acquired.js";

export const talents = new Registry("才能").registerAll([...INNATE_TALENTS, ...EVOLVED_TALENTS, ...ACQUIRED_TALENTS]);

export function innateTalents() {
  return talents.all().filter((t) => t.kind === "innate");
}

export function acquiredTalents() {
  return talents.all().filter((t) => t.kind === "acquired");
}
