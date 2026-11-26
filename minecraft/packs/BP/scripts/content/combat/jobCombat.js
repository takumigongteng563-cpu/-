// =============================================================
// 職業別の戦闘仕様（第5弾・指示書第17章）
// 第3弾の12役割を10の戦闘スタイルに対応させ、役割ごとの「固有パッシブの仕組み」（第3弾で予定として定義）を
// 戦闘処理で実際に動かす。同じ役割でも武器・属性・専用スキルで戦い方が変わる。特定の職業を必須にしない。
// trait の値は職業の段階（1〜5）で強くなる：値 × (0.6 + 段階 × 0.2)
// =============================================================
export const COMBAT_STYLES = Object.freeze({
  tank: "タンク", melee: "近接アタッカー", ranged: "遠距離アタッカー", magic: "魔法アタッカー", healer: "ヒーラー",
  buffer: "バッファー", debuffer: "デバッファー", summoner: "召喚職", disruptor: "妨害職", allround: "万能職",
});

/**
 * 役割 → 戦闘スタイルと特性
 *  hate：ヘイトの増えやすさ / guard：ガードの軽減率に加算 / comboChain：連続命中ごとの追加 / distance：距離ボーナス（1ブロックごと）
 *  sameElement：同じ属性の連続使用 / counterCrit：ジャスト回避後の反撃が確定クリティカル / unaware：自分を狙っていない敵への追加
 *  moveBonus：移動距離10ブロックごとの追加 / healBonus / buffSelf：強化した仲間1人ごとの自己強化 / statusDuration：付与する状態異常の時間
 *  guardHeal：ガード成功で自分と周囲を回復（最大HP比） / summonLead：統率力の召喚獣補正
 */
export const ROLE_COMBAT = Object.freeze({
  guardian: { style: "tank", hate: 1.5, guard: 0.15, mechanic: "敵の攻撃を引きつけ、被ダメージの一部を軽減する" },
  striker: { style: "melee", comboChain: 0.03, mechanic: "連続で攻撃を当てるほど威力が上がる" },
  duelist: { style: "melee", counterCrit: true, mechanic: "見切って回避した直後の攻撃が必ずクリティカル" },
  marksman: { style: "ranged", distance: 0.02, distanceMax: 0.4, mechanic: "距離が離れているほど威力が上がる" },
  caster: { style: "magic", sameElement: 0.05, sameElementMax: 0.25, mechanic: "同じ属性の魔法を続けて使うと威力が上がる" },
  healer: { style: "healer", healBonus: 0.15, mechanic: "回復した量に応じて次の回復の効果が上がる" },
  buffer: { style: "buffer", buffSelf: 0.03, mechanic: "強化を与えた仲間の数だけ自分も少し強くなる" },
  summoner: { style: "summoner", summonLead: true, mechanic: "召喚獣の強さが統率力に応じて上がる" },
  assassin: { style: "melee", unaware: 0.5, mechanic: "自分を狙っていない敵への攻撃が大ダメージになる" },
  controller: { style: "debuffer", statusDuration: 0.3, statusChance: 10, mechanic: "状態異常の効果時間が延びる" },
  skirmisher: { style: "allround", moveBonus: 0.05, moveMax: 0.3, mechanic: "移動距離に応じて次の攻撃が強化される" },
  warden: { style: "tank", hate: 1.2, guard: 0.1, guardHeal: 0.03, mechanic: "仲間を守ったときに自分と周囲を回復する" },
});

/** 役割が disruptor（妨害職）になる職業：controller のうち融合に盗賊を含むもの（データで判定） */
export function styleOf(job) {
  if (!job || !job.role) return "allround";
  const r = ROLE_COMBAT[job.role];
  if (job.role === "controller" && (job.fusedLines || []).includes("thief")) return "disruptor";
  return r ? r.style : "allround";
}

/** 職業専用能力値 → 戦闘への効果（値1あたり。上限あり） */
export const SPECIAL_COMBAT = Object.freeze({
  sword_aura: { physicalSkill: 0.002, weapons: ["sword", "greatsword", "katana", "dual"], max: 0.5, name: "剣技の威力" },
  battle_aura: { physical: 0.0015, poise: 0.003, max: 0.4, name: "物理攻撃・体勢崩し" },
  guard_power: { guard: 0.001, max: 0.2, name: "ガード軽減" },
  mana_control: { magical: 0.002, max: 0.5, name: "魔法の威力" },
  spirit_affinity: { elemental: 0.002, max: 0.4, name: "属性攻撃" },
  summon_power: { summon: 0.003, max: 0.6, name: "召喚獣" },
  bow_control: { ranged: 0.002, max: 0.5, name: "射撃の威力" },
  stealth: { unaware: 0.002, max: 0.4, name: "不意打ち" },
  illusion_control: { status: 0.002, max: 0.3, name: "状態異常の確率" },
  faith: { divine: 0.002, max: 0.3, name: "神性・加護" },
  healing_power: { heal: 0.002, max: 0.5, name: "回復量" },
  holy_power: { holy: 0.003, max: 0.6, name: "神聖属性" },
});
