// =============================================================
// バフ・デバフ（第5弾・指示書第13章）
// ・一時効果は data.buffs（第2弾から）に保存し、source で発生元を区別する
//   "skill"＝通常バフ / "equip"＝装備バフ / "talent"＝才能バフ / "blessing:<神>"＝神々の加護 / "apostle:<神>"＝使徒バフ / "combat"＝戦闘効果
// ・同じ id は1つだけ（上書き）。stack を持つものは重複上限まで重ねる
// ・解除条件：期限 / 戦闘終了（clearOnCombatEnd）/ 浄化（dispellable）/ 使徒契約の解除（apostle）
// ・永久バフ付き装備：装備中の効果（equip）と恒久適用（permanent）を別に持つ（装備の本格実装は第6弾）
// =============================================================
export const BUFF_SOURCES = Object.freeze({ skill: "通常バフ", equip: "装備バフ", talent: "才能バフ", blessing: "神々の加護", apostle: "使徒バフ", combat: "戦闘効果", permanent: "永久効果" });

/** 戦闘で使うバフ・デバフの種類（派生能力値の pct / 戦闘モジュール専用の値） */
export const BUFF_TYPES = Object.freeze({
  atk_up: { name: "攻撃力上昇", derived: { pct: { physAtk: 15 } } },
  def_up: { name: "防御力上昇", derived: { pct: { physDef: 15, magDef: 10 } } },
  mag_up: { name: "魔力上昇", derived: { pct: { magAtk: 15 } } },
  speed_up: { name: "移動速度上昇", derived: { flat: { moveSpeed: 0.1 } } },
  heal_up: { name: "回復量上昇", derived: { flat: { healPower: 20 } } },
  crit_up: { name: "クリティカル率上昇", derived: { flat: { critRate: 10 } } },
  resist_up: { name: "属性耐性上昇", combat: { elementTaken: -0.15 } },
  cast_up: { name: "詠唱速度上昇", derived: { flat: { castSpeed: 20 } } },
  cd_down: { name: "クールタイム短縮", combat: { cooldown: -0.15 } },
  dmg_cut: { name: "ダメージ軽減", combat: { damageTaken: -0.2 } },
  just_evade: { name: "見切り（行動速度上昇）", derived: { flat: { moveSpeed: 0.15 } }, combat: { counter: 1 }, clearOnCombatEnd: true },
  atk_down: { name: "攻撃力低下", debuff: true, derived: { pct: { physAtk: -15, magAtk: -15 } } },
  def_down: { name: "防御力低下", debuff: true, derived: { pct: { physDef: -15, magDef: -15 } } },
  slow: { name: "移動速度低下", debuff: true, derived: { flat: { moveSpeed: -0.1 } } },
  heal_block: { name: "回復阻害", debuff: true, combat: { healTaken: -0.5 } },
  element_weak: { name: "属性弱体化", debuff: true, combat: { elementTaken: 0.2 } },
  hit_down: { name: "命中率低下", debuff: true, derived: { flat: { hitRate: -15 } } },
});
