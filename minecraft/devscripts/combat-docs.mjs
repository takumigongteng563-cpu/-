// 戦闘の資料を自動生成（第5弾）：docs/combat/{ダメージ計算式,属性相性表,属性融合一覧,状態異常一覧,バフ・デバフ一覧,職業別戦闘仕様,神々・使徒能力}.md
import fs from "node:fs";
console.warn = () => {};
const { DAMAGE_TYPES } = await import("../packs/BP/scripts/combat/damageCalc.js");
const { ELEMENTS, ELEMENT_IDS, ELEMENT_FUSIONS, AFFINITY_LEVELS, baseAffinity } = await import("../packs/BP/scripts/content/combat/elements.js");
const { ELEMENT_NAMES } = await import("../packs/BP/scripts/content/jobs/catalog.js");
const { STATUS_EFFECTS } = await import("../packs/BP/scripts/content/combat/statusEffects.js");
const { BUFF_TYPES, BUFF_SOURCES } = await import("../packs/BP/scripts/content/combat/buffs.js");
const { ROLE_COMBAT, COMBAT_STYLES, SPECIAL_COMBAT, styleOf } = await import("../packs/BP/scripts/content/combat/jobCombat.js");
const { ENEMY_PROFILES } = await import("../packs/BP/scripts/content/combat/enemies.js");
const { BOSS_ABILITIES } = await import("../packs/BP/scripts/content/combat/bossAbilities.js");
const { ROLES } = await import("../packs/BP/scripts/content/jobs/catalog.js");
const { normalJobs } = await import("../packs/BP/scripts/content/jobs.js");
const { gods, GOD_DETAILS, APOSTLE_STAGES, apostleStageNames } = await import("../packs/BP/scripts/content/gods.js");
const B = await import("../packs/BP/scripts/balance/combat.js");
const { ADDON_VERSION } = await import("../packs/BP/scripts/config.js");
const D = "docs/combat";
const head = (t) => [`# ${t}（v${ADDON_VERSION}）`, "", "`npm run docs:combat` で自動生成。数値はすべて暫定（`balance/combat.js` で調整）。", ""];
const N = (e) => ELEMENT_NAMES[e];
const w = (f, l) => fs.writeFileSync(`${D}/${f}.md`, l.join("\n") + "\n");

w("ダメージ計算式", [...head("ダメージ計算式"), "処理の順番（`combat/damageCalc.js`）：", "", "1. 基礎攻撃力（物理＝物理攻撃力、魔法・属性＝魔法攻撃力。固定＝指定値、割合＝最大HP×割合）", "2. スキル倍率（スキルの威力式 ÷ 10）", "3. 武器性能（通常攻撃はバニラの武器ダメージ。装備は第6弾）", "4. 職業補正（職業専用能力値）", "5. 才能補正", `6. 熟練度補正（スキルLv1ごと+${B.COMBAT.masteryPerLevel * 100}%・最大+${B.COMBAT.masteryMax * 100}%）`, `7. 防御：ダメージ × 攻撃 ÷（攻撃 ＋ 防御×${B.COMBAT.defFactor}×分類の防御率）`, `8. 属性相性（複数属性は平均・上限${B.COMBAT.elementMax}）`, `9. クリティカル（倍率上限${B.COMBAT.critMax}）`, `10. 部位弱点×${B.COMBAT.partWeakMult}・体勢崩し中×${B.COMBAT.brokenMult}`, "11. バフ・デバフ（攻撃側−90%〜+200%、受ける側−80%〜+200%）", "12. 神々の加護（0.5〜2倍）", "13. 特殊効果（コンボ・反撃・連携・役割の仕組み。0〜4倍）", `14. 上限（基礎の${B.COMBAT.totalMultMax}倍・1回${B.COMBAT.maxDamage}、固定・割合は敵ごとの上限）`, "", `最後に「戦闘の数値 × ${B.COMBAT.vanillaScale} ÷ 参加人数の補正」をバニラの体力に与える。バニラの攻撃で入った分との差分だけを調整するため二重に入らない。`, "", "## ダメージ分類", "", "| 分類 | 防御 | 防御率 | 会心 | 属性 | 上限 |", "|---|---|---:|---|---|---|", ...Object.values(DAMAGE_TYPES).map((t) => `| ${t.name} | ${t.def || "なし"} | ${t.defRate} | ${t.noCrit ? "なし" : "あり"} | ${t.noElement ? "なし" : "あり"} | ${t.cap ? `敵ごと（${t.cap}）` : "-"} |`), "", "## ガード・回避", "", "| 項目 | 値 |", "|---|---|", ...Object.entries(B.DEFENSE).map(([k, v]) => `| ${k} | ${v} |`), "", "## コンボ", "", "| 項目 | 値 |", "|---|---|", ...Object.entries(B.COMBO).map(([k, v]) => `| ${k} | ${v} |`), "", "## 参加人数の補正（敵の実効HP）", "", "| 人数 | HP | 攻撃 |", "|---|---:|---:|", ...[1, 2, 3, 4].map((n) => `| ${n} | ${B.PARTY_SCALING.hp[n] * 100}% | ${B.PARTY_SCALING.attack[n] * 100}% |`)]);

const aff = { weak: "◎1.5", resist: "△0.5", normal: "・" };
w("属性相性表", [...head("属性相性表"), "倍率：" + Object.values(AFFINITY_LEVELS).map((l) => `${l.name}${l.mult}`).join(" / "), "", "基本の相性（行＝攻撃、列＝防御側の属性）。敵ごとの耐性表（`content/combat/enemies.js`）で上書きされる。", "", `| 攻撃＼防御 | ${ELEMENT_IDS.map(N).join(" | ")} |`, `|---|${ELEMENT_IDS.map(() => "---").join("|")}|`, ...ELEMENT_IDS.map((a) => `| **${N(a)}** | ${ELEMENT_IDS.map((d) => aff[baseAffinity(a, d)]).join(" | ")} |`), "", "## 属性の役割", "", "| 属性 | 役割 | 付与する状態異常 | 弱点を突ける属性 |", "|---|---|---|---|", ...ELEMENT_IDS.map((e) => `| ${N(e)} | ${ELEMENTS[e].role} | ${ELEMENTS[e].status.map((s) => STATUS_EFFECTS[s].name).join("・") || "-"} | ${ELEMENTS[e].strong.map(N).join("・") || "-"} |`), "", "## 敵の耐性（登録済み）", "", "| 敵 | Lv | 属性 | 耐性 | 体勢値 | ヘイト |", "|---|---:|---|---|---:|---|", ...Object.entries(ENEMY_PROFILES).map(([id, p]) => `| ${id} | ${p.level} | ${N(p.element)} | ${Object.entries(p.resist).map(([e, l]) => `${N(e)}:${AFFINITY_LEVELS[l].name}`).join(" ") || "-"} | ${p.poise} | ${p.hate} |`)]);

w("属性融合一覧", [...head("属性融合一覧"), "別の属性で攻撃された直後（4秒以内）の対象に、組み合わせの属性で攻撃すると発生（定義済みの組み合わせのみ）。", "", "| 融合 | 組み合わせ | 効果 |", "|---|---|---|", ...ELEMENT_FUSIONS.map((f) => `| ${f.name} | ${f.elements.map(N).join("＋")} | ${f.effect.type === "field" ? `半径${f.effect.radius}に威力×${f.effect.power}${f.effect.status ? `・${STATUS_EFFECTS[f.effect.status].name}` : ""}${f.effect.cleanse ? "・浄化" : ""}` : f.effect.type === "heal" ? `半径${f.effect.radius}の仲間を回復` : "特殊召喚（召喚の上限に従う）"} |`)]);

w("状態異常一覧", [...head("状態異常一覧"), `ボス対策：同じ状態異常を受けるたびに確率・効果時間が${B.STATUS_TOLERANCE.perApply * 100}%ずつ下がる（最大${B.STATUS_TOLERANCE.max * 100}%）。ボス級は確率半分・行動妨害は最長${B.STATUS_TOLERANCE.controlMaxTicksBoss}tick。`, "", "| 状態異常 | 種類 | 確率 | 時間 | 効果量 | 重複 | 解除 | 耐性 |", "|---|---|---:|---:|---:|---:|---|---|", ...Object.entries(STATUS_EFFECTS).map(([id, s]) => `| ${s.name}（${id}） | ${s.kind}${s.control ? `:${s.control}` : ""} | ${s.chance}% | ${(s.duration / 20).toFixed(1)}秒 | ${s.power} | ${s.maxStacks} | ${s.cure.join("・")} | ${s.resist || "statusResist"}・タグ ${id}_immune |`)]);

w("バフ・デバフ一覧", [...head("バフ・デバフ一覧"), "発生元：" + Object.values(BUFF_SOURCES).join("・"), "", "| 種類 | バフ/デバフ | 効果 |", "|---|---|---|", ...Object.entries(BUFF_TYPES).map(([id, b]) => `| ${b.name}（${id}） | ${b.debuff ? "デバフ" : "バフ"} | ${JSON.stringify(b.derived || b.combat)} |`)]);

const byRole = {};
for (const j of normalJobs()) (byRole[j.role] = byRole[j.role] || []).push(j);
w("職業別戦闘仕様", [...head("職業別戦闘仕様"), "| 役割 | 戦闘スタイル | 戦闘での仕組み（実装済み） | 職業数 |", "|---|---|---|---:|", ...Object.entries(ROLE_COMBAT).map(([r, c]) => `| ${ROLES[r].name} | ${COMBAT_STYLES[c.style]} | ${c.mechanic} | ${(byRole[r] || []).length} |`), "", "妨害職：妨害・制御の役割で盗賊系統を含む職業。特性は職業の段階で強くなる（×0.6+段階×0.2）。", "", "## 職業専用能力値の戦闘効果", "", "| 専用能力値 | 効果 | 上限 |", "|---|---|---:|", ...Object.entries(SPECIAL_COMBAT).map(([k, v]) => `| ${k} | ${v.name} | +${v.max * 100}% |`), "", "## 職業ごとの戦闘スタイル", "", "| 職業 | 段階 | スタイル | 属性 | 武器 |", "|---|---:|---|---|---|", ...normalJobs().map((j) => `| ${j.name} | ${j.tier} | ${COMBAT_STYLES[styleOf(j)]} | ${j.elements.map(N).join("・")} | ${j.weapons.join("・")} |`)]);

w("神々・使徒能力", [...head("神々・使徒能力の設定データ"), `使徒能力は5段階（信仰Lv ${APOSTLE_STAGES.join("/")}）×24柱＝120段階。最終段階は神の権能の一部（制限つき）。神々の報酬装備は使徒専用装備とは別で、使徒でなくても迷宮の試練で獲得できる（装備の本格実装は第6弾、迷宮は未実装）。`, "", "| 神 | 試練 | 使徒専用能力 | 5段階 | 権能 | 制限 | アーティファクト | 報酬装備 |", "|---|---|---|---|---|---|---|---|", ...gods.all().map((g) => { const x = GOD_DETAILS[g.id]; return `| ${g.name}（${g.domain}） | ${x.trial} | ${x.ability} | ${apostleStageNames(g).join(" → ")} | ${x.power} | ${x.limit || "消費・時間・CTで制限"} | ${x.artifact} | ${x.equipment} |`; }), "", "## 神の権能の制限", "", "| 項目 | 値 |", "|---|---|", ...Object.entries(B.DIVINE_LIMITS).map(([k, v]) => `| ${k} | ${v} |`), "", "## ボス特殊能力の基盤（第7弾で使用）", "", "| 能力 | 予告 | 攻略手段（counters） |", "|---|---:|---|", ...Object.values(BOSS_ABILITIES).map((a) => `| ${a.name} | ${a.telegraph}tick | ${a.counters.join("・")} |`)]);
console.log("戦闘資料を生成しました");
