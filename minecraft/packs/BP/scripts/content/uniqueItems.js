// =============================================================
// 世界唯一の装備（最終仕様 Ver.1.0 第14章）【管理基盤】
// 実際の装備（50種以上）は第6弾で追加する。
// 定義項目：
//   id, name
//   ownerConditions: 装備が所有者に選ぶ条件（talents/conditions.js の書き方）。満たさない人は所持できない
//   variants: 所有者の職業・才能による性能・進化先の違い（第6弾）
// =============================================================
import { Registry } from "./registry.js";

export const uniqueItems = new Registry("世界唯一の装備").registerAll([
  { id: "sample:unique_blade", name: "見本の唯一剣", sample: true, ownerConditions: [] },
]);
