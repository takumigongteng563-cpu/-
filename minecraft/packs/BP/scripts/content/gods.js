// =============================================================
// 24柱の神々（第4弾で正式登録。名前・英語表記・司る力・性別は確定）
// 新たな神を無断で追加しないこと。性格・容姿・個別の能力・神同士の関係は今後の企画会議で確定する。
//
// ・element / faith / replaceRule は開発側の【暫定】設定（司る力からの仮の対応）。確定後に差し替える
//   faith.actions  ：信仰経験値が得られる行動（talents/conditions の行動キー）
//   faith.elements ：その属性のスキルを使うと信仰経験値が得られる
//   replaceRule    ：使徒を別の勇者に替える判断の基準（信仰レベルの差など）。神ごとに変更可能
//   approval       ：使徒契約に必要な「神からの承認」（フラグ。神々の試練などで立てる。後続で実装）
// =============================================================
import { Registry } from "./registry.js";

const g = (id, name, en, domain, gender, element, faith, extra = {}) => ({
  id,
  name,
  en,
  domain,
  gender,
  element,
  faith: { actions: faith.actions || [], elements: faith.elements || [element] },
  contract: { faithLevel: 5, approvalFlag: `god:${id}:approval` },
  replaceRule: { faithMargin: 3 },
  provisional: true,
  ...extra,
});

export const gods = new Registry("神").registerAll([
  g("takaphides", "タカフィデス", "Takaphides", "太陽", "male", "light", { elements: ["light", "fire"] }),
  g("komuroa", "コムーロア", "Komuroa", "空気", "female", "wind", { actions: ["move.distance"] }),
  g("eucalia", "ユーカリア", "Eucalia", "水", "female", "water", {}),
  g("komjina", "コームジーナ", "Komjina", "金", "female", "metal", { actions: ["stage.clear"] }),
  g("ojaria", "オジャリア", "Ojaria", "影", "female", "dark", { actions: ["kill.night"] }),
  g("kailas", "カイラス", "Kailas", "嘘", "male", "mind", {}),
  g("fudonius", "フドニウス", "Fudonius", "時", "male", "time", {}),
  g("mikiorus", "ミキオルス", "Mikiorus", "欲望", "male", "none", { actions: ["stage.clear", "kill.strong"], elements: [] }),
  g("kenjios", "ケンジオス", "Kenjios", "戦", "male", "none", { actions: ["kill.hostile", "kill.strong"], elements: [] }),
  g("takujiel", "タクジエル", "Takujiel", "喜怒哀楽", "male", "mind", { actions: ["survive.lowhp"] }),
  g("haradius", "ハラディウス", "Haradius", "知", "male", "none", { actions: ["magic.cast", "skill.learn"], elements: [] }),
  g("chicaria", "チーカリア", "Chicaria", "生命", "female", "life", { actions: ["heal.amount"] }),
  g("madamgorgos", "マダムゴルゴス", "Madamgorgos", "死", "female", "abyss", { actions: ["kill.hostile"], elements: ["abyss", "poison"] }),
  g("devorus", "デヴォルス", "Devorus", "大地", "male", "earth", {}),
  g("hagerion", "ハーゲリオン", "Hagerion", "雷", "male", "thunder", {}),
  g("takerius", "タケリウス", "Takerius", "炎", "male", "fire", {}),
  g("kotarion", "コータリオン", "Kotarion", "氷", "male", "ice", {}),
  g("kanastia", "カナスティア", "Kanastia", "自然", "male", "plant", { actions: ["move.distance"] }),
  g("nanastella", "ナナステラ", "Nanastella", "空間", "female", "space", {}),
  g("yukisia", "ユキシア", "Yukisia", "運命", "female", "none", { actions: ["survive.lowhp", "boss.kill"], elements: [] }),
  g("kikueria", "キクエリア", "Kikueria", "創造", "female", "creation", { actions: ["skill.fusion"] }),
  g("momoria", "モモリア", "Momoria", "混沌", "female", "explosion", {}),
  g("nomuradia", "ノムラディア", "Nomuradia", "絆", "female", "none", { actions: ["protect.ally", "skill.link"], elements: [] }),
  g("gokitalis", "ゴキタリス", "Gokitalis", "夢", "male", "mind", { actions: ["rest.sleep"] }),
]);

/**
 * 第5弾：迷宮の試練・使徒専用能力・報酬（指示書第18・21章）。名前・性別・司る力は変更しない
 * trial＝迷宮の試練の特徴 / ability＝使徒専用能力 / artifact＝迷宮の扉を開くアーティファクト / equipment＝神々の報酬装備
 * stages＝使徒能力の5段階の名前（未指定の神は共通の名前の付け方）
 * power＝最終段階で使える神の権能の種類（skillEffects と balance/combat.js の DIVINE_LIMITS で制限）
 * ・神々の報酬装備は使徒専用装備とは別。使徒でなくても迷宮の試練で獲得できる（装備の本格実装は第6弾）
 */
export const GOD_DETAILS = Object.freeze({
  takaphides: { trial: "光を失った世界", ability: "太陽の支配", artifact: "太陽の欠片", equipment: "日輪の冠", power: "area" },
  komuroa: { trial: "天空の迷宮", ability: "大気操作", artifact: "天空の羽根", equipment: "天風の翼", power: "projectile" },
  eucalia: { trial: "水没神殿", ability: "水流支配", artifact: "深海の真珠", equipment: "海神の指輪", power: "heal" },
  komjina: { trial: "財宝と取引", ability: "黄金創造", artifact: "黄金の天秤", equipment: "黄金王の腕輪", power: "shield", limit: "金貨は生成しない（戦闘中の黄金の盾のみ）" },
  ojaria: { trial: "光のない迷宮", ability: "影世界", artifact: "漆黒の鏡", equipment: "影神の外套", power: "debuff" },
  kailas: { trial: "嘘と真実", ability: "幻想実体化", artifact: "偽りの仮面", equipment: "虚偽の首飾り", power: "debuff" },
  fudonius: { trial: "時間逆行", ability: "時間支配", artifact: "壊れた懐中時計", equipment: "永刻の腕輪", power: "rewind", stages: ["時の加護", "時間加速", "時間遅延", "時間逆行", "時界支配"], limit: "時間逆行は戦闘中の自分のHP・MPを5秒前に戻すだけ（ワールド・セーブデータ・ストーリーは戻さない）" },
  mikiorus: { trial: "欲望と選択", ability: "欲望具現化", artifact: "欲望の杯", equipment: "強欲の指輪", power: "buff" },
  kenjios: { trial: "強敵との連戦", ability: "闘気解放", artifact: "古びた勲章", equipment: "戦神の紋章", power: "melee", stages: ["戦意", "闘気解放", "戦神の鼓動", "超越闘気", "戦域支配"] },
  takujiel: { trial: "喜怒哀楽の四世界", ability: "感情支配", artifact: "四色の宝石", equipment: "感情の王冠", power: "law" },
  haradius: { trial: "知識と推理", ability: "万物解析", artifact: "白紙の魔導書", equipment: "叡智の眼鏡", power: "analyze" },
  chicaria: { trial: "生命の保護", ability: "生命創生", artifact: "生命の種", equipment: "不朽の首飾り", power: "heal" },
  madamgorgos: { trial: "魂の導き", ability: "魂魄支配", artifact: "魂の灯火", equipment: "冥界の指輪", power: "area" },
  devorus: { trial: "地下世界", ability: "重力支配", artifact: "原初の鉱石", equipment: "大地の鎧", power: "shield" },
  hagerion: { trial: "時間制限付き試練", ability: "雷化", artifact: "雷鳴の結晶", equipment: "雷神の靴", power: "area" },
  takerius: { trial: "灼熱世界", ability: "神炎支配", artifact: "消えない炭", equipment: "炎帝の腕輪", power: "area" },
  kotarion: { trial: "氷の謎解き", ability: "絶対零度", artifact: "永久氷晶", equipment: "氷神の外套", power: "debuff" },
  kanastia: { trial: "森林の再生", ability: "自然同化", artifact: "世界樹の枝", equipment: "森羅の冠", power: "heal" },
  nanastella: { trial: "転移パズル", ability: "空間支配", artifact: "歪んだ羅針盤", equipment: "次元の指輪", power: "blink", limit: "転移は12ブロック以内の安全な場所のみ（未解放ステージへは入れない）" },
  yukisia: { trial: "運と選択", ability: "確率操作", artifact: "運命の賽", equipment: "奇跡の首飾り", power: "fortune", limit: "クリティカル率の上昇は最大+20%" },
  kikueria: { trial: "建築と物質生成", ability: "物質創造", artifact: "原初の設計図", equipment: "創造神の手袋", power: "shield", limit: "アイテム・装備は生成しない（戦闘中の結界のみ）" },
  momoria: { trial: "法則が変化する迷宮", ability: "法則改変", artifact: "混沌の結晶", equipment: "混沌の王冠", power: "law", limit: "法則改変は定義済みの戦闘効果から選ぶ" },
  nomuradia: { trial: "協力と信頼", ability: "能力共有", artifact: "結ばれた赤い糸", equipment: "絆の腕輪", power: "share", stages: ["絆の加護", "生命共有", "能力共鳴", "連携覚醒", "魂の共鳴領域"], limit: "能力共有は自分の能力値の15%（1能力値あたり最大50）を一時的に分けるだけで増殖しない" },
  gokitalis: { trial: "夢と現実", ability: "夢世界展開", artifact: "夢幻の枕", equipment: "夢幻の首飾り", power: "debuff" },
});

/** 使徒能力の段階と必要な信仰レベル（暫定・指示書第19章） */
export const APOSTLE_STAGES = Object.freeze([1, 10, 20, 30, 50]);

/** 使徒能力の段階の名前 */
export function apostleStageNames(god) {
  const x = GOD_DETAILS[god.id];
  if (x.stages) return x.stages;
  return [`${god.domain}の加護`, `${god.domain}の印`, `${god.domain}の御手`, x.ability, `権能・${x.ability}`];
}

/** 世界観（MASTER_SPEC 第31章）：神々は魔神野口に敗北し、一部は封印、残りは自ら迷宮へ身を隠した */
export const GOD_COUNT = 24;
