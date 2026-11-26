// =============================================================
// 状態異常（第5弾・指示書第12章：23種）
// chance   基本の発生確率（%）。付与側の幸運・知力で上がり、受ける側の状態異常耐性で下がる
// duration 基本の効果時間（tick） / power 効果量 / maxStacks 重複上限
// cure     解除条件（"cleanse"＝浄化・回復 / "hit"＝攻撃を受ける / "time"＝時間のみ / "move"）
// resist   耐性に使う派生能力値 / immuneTags 完全無効になる敵のタグ（content/combat/enemies.js）
// kind     dot＝継続ダメージ（1秒ごと・最大HPの power%）/ stat＝能力の低下 / control＝行動妨害
// vanilla  見た目と移動のためのバニラの状態効果（実際の効果量は戦闘モジュールが計算）
// ・ボス対策：同じ状態異常を受けるたびに「累積耐性」がたまり、効果時間が短く・確率が下がる（balance/combat.js）
// =============================================================
export const STATUS_EFFECTS = Object.freeze({
  burn: { name: "火傷", kind: "dot", chance: 30, duration: 100, power: 1.0, maxStacks: 3, cure: ["cleanse", "wet"], vanilla: null },
  poison: { name: "毒", kind: "dot", chance: 35, duration: 160, power: 0.6, maxStacks: 3, cure: ["cleanse"], vanilla: "poison" },
  toxic: { name: "猛毒", kind: "dot", chance: 15, duration: 160, power: 1.5, maxStacks: 2, cure: ["cleanse"], vanilla: "poison" },
  freeze: { name: "氷結", kind: "control", chance: 15, duration: 40, power: 1, maxStacks: 1, cure: ["hit", "cleanse"], control: "stun", vanilla: "slowness", amp: 5 },
  slow: { name: "鈍化", kind: "stat", chance: 40, duration: 100, power: 0.3, maxStacks: 2, cure: ["cleanse"], stat: { moveSpeed: -1 }, vanilla: "slowness", amp: 1 },
  paralysis: { name: "麻痺", kind: "control", chance: 15, duration: 30, power: 1, maxStacks: 1, cure: ["cleanse"], control: "stun", vanilla: "slowness", amp: 4 },
  shock: { name: "感電", kind: "dot", chance: 30, duration: 60, power: 0.8, maxStacks: 2, cure: ["cleanse"], vanilla: null },
  wet: { name: "水濡れ", kind: "stat", chance: 60, duration: 200, power: 0.2, maxStacks: 1, cure: ["time", "burn"], elementWeak: { thunder: 1.25, ice: 1.25 }, vanilla: null },
  bind: { name: "拘束", kind: "control", chance: 20, duration: 40, power: 1, maxStacks: 1, cure: ["cleanse", "move"], control: "root", vanilla: "slowness", amp: 6 },
  sleep: { name: "睡眠", kind: "control", chance: 15, duration: 80, power: 1, maxStacks: 1, cure: ["hit", "cleanse"], control: "stun", vanilla: "slowness", amp: 6 },
  confusion: { name: "混乱", kind: "control", chance: 20, duration: 60, power: 1, maxStacks: 1, cure: ["cleanse", "hit"], control: "confuse", vanilla: "nausea" },
  fear: { name: "恐怖", kind: "stat", chance: 20, duration: 60, power: 0.2, maxStacks: 1, cure: ["cleanse"], stat: { atk: -1 }, vanilla: "weakness" },
  illusion: { name: "幻覚", kind: "stat", chance: 20, duration: 80, power: 0.2, maxStacks: 1, cure: ["cleanse", "light"], stat: { hit: -1 }, vanilla: "blindness" },
  curse: { name: "呪い", kind: "stat", chance: 20, duration: 200, power: 0.3, maxStacks: 1, cure: ["cleanse"], stat: { heal: -1 }, vanilla: null },
  silence: { name: "沈黙", kind: "control", chance: 20, duration: 80, power: 1, maxStacks: 1, cure: ["cleanse"], control: "silence", vanilla: null },
  blind: { name: "暗闇", kind: "stat", chance: 25, duration: 80, power: 0.3, maxStacks: 1, cure: ["cleanse"], stat: { hit: -1 }, vanilla: "blindness" },
  fatigue: { name: "疲労", kind: "stat", chance: 30, duration: 160, power: 0.3, maxStacks: 2, cure: ["cleanse"], stat: { staminaRegen: -1 }, resist: "fatigueResist", vanilla: "mining_fatigue" },
  stun: { name: "気絶", kind: "control", chance: 10, duration: 30, power: 1, maxStacks: 1, cure: ["time"], control: "stun", vanilla: "slowness", amp: 6 },
  def_down: { name: "防御低下", kind: "stat", chance: 35, duration: 160, power: 0.15, maxStacks: 3, cure: ["cleanse"], stat: { def: -1 }, vanilla: null },
  atk_down: { name: "攻撃低下", kind: "stat", chance: 35, duration: 160, power: 0.15, maxStacks: 3, cure: ["cleanse"], stat: { atk: -1 }, vanilla: "weakness" },
  heal_block: { name: "回復阻害", kind: "stat", chance: 30, duration: 120, power: 0.5, maxStacks: 1, cure: ["cleanse"], stat: { heal: -1 }, vanilla: null },
  resist_down: { name: "属性耐性低下", kind: "stat", chance: 30, duration: 160, power: 0.2, maxStacks: 2, cure: ["cleanse"], stat: { elementTaken: 1 }, vanilla: null },
  skill_seal: { name: "スキル封印", kind: "control", chance: 15, duration: 100, power: 1, maxStacks: 1, cure: ["cleanse"], control: "seal", vanilla: null },
});

export const STATUS_IDS = Object.freeze(Object.keys(STATUS_EFFECTS));

/** 行動妨害（control）の種類 */
export const CONTROL_TYPES = Object.freeze({ stun: "行動不能", root: "移動不能", confuse: "混乱", silence: "魔法不可", seal: "スキル不可" });

/** 第4弾のバニラ状態効果のIDから、この状態異常へ（スキルデータの互換） */
export const VANILLA_TO_STATUS = Object.freeze({ slowness: "slow", weakness: "atk_down", poison: "poison", wither: "toxic", blindness: "blind", nausea: "confusion", mining_fatigue: "fatigue" });
