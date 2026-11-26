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

/** 世界観（MASTER_SPEC 第31章）：神々は魔神野口に敗北し、一部は封印、残りは自ら迷宮へ身を隠した */
export const GOD_COUNT = 24;
