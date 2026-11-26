// =============================================================
// スキル定義（最終仕様 Ver.1.0 第11章）【基盤のみ・スキル本体は第4弾】
// 定義項目（予定）：
//   id, name, kind: "weapon"|"magic"|"support"|...,
//   actions: ["tap","jump","sprint","charge","ultimate"]  割り当てできる操作
//   cost: { mp, stamina }, cooldownTicks, requirements（使用条件：能力値・才能・熟練度・職業）,
//   learn: [...]（レベルアップ・スキルポイント・行動・熟練度・魔導書・師匠・ステージ・特殊条件・才能覚醒）,
//   evolvesTo, fusion, awaken
// 実行処理（効果）は registerSkillExecutor(id, fn) で登録する。
// =============================================================
import { Registry } from "./registry.js";

export const skills = new Registry("スキル").registerAll([]);

/** @type {Map<string, (player: any, ctx: any) => boolean>} */
export const skillExecutors = new Map();

export function registerSkillExecutor(id, fn) {
  skillExecutors.set(id, fn);
}
