// =============================================================
// 神々・信仰メニュー（第4弾）
// ・24柱の信仰レベル（複数の神を同時に育てられる）・使徒の状況・神々の迷宮の解放状況
// ・使徒契約（信仰レベル＋神の承認）・自主的な解除・神からの打診の受諾
// =============================================================
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { gods } from "../../content/gods.js";
import { skills } from "../../content/skills.js";
import { ELEMENT_NAMES } from "../../content/jobs/catalog.js";
import { FAITH_CURVE } from "../../balance/skills.js";
import { faithToNext } from "../../skills/skillRules.js";
import { showForm } from "../formUtil.js";
import { showInfoPage } from "./infoPage.js";
import { skillDetailText } from "./skill.js";
import { heading, lines, num } from "../format.js";

const GENDER = { male: "男神", female: "女神" };
const data = (player) => ctx.playerService.dataFor(player.id);
const faithOf = (d, id) => d.faith[id] || { level: 0, exp: 0 };

function godBody(d, g) {
  const f = faithOf(d, g.id);
  const reg = ctx.worldService.world.apostles[g.id];
  const ap = skills.all().filter((s) => s.category === "apostle" && s.god === g.id);
  const me = d.apostle.god === g.id;
  return lines(
    heading(`${g.name}（${g.en}）`),
    `司る力：${g.domain}　${GENDER[g.gender]}`,
    `信仰レベル：§e${f.level}§r / ${FAITH_CURVE.maxLevel}${f.level < FAITH_CURVE.maxLevel ? `　（${num(f.exp)} / ${num(faithToNext(f.level + 1))}）` : ""}`,
    `使徒：${reg ? (reg.uid === d.uid ? "§6あなた§r" : reg.name) : "§7不在§r"}`,
    "",
    heading("信仰が深まる行い【暫定】"),
    g.faith.elements.length ? `・${g.faith.elements.map((e) => ELEMENT_NAMES[e]).join("・")}属性のスキルを敵や仲間に使う` : null,
    g.faith.actions.length ? `・${g.faith.actions.map((a) => ACTION_JA[a] ?? a).join("・")}` : null,
    "",
    heading("加護"),
    `${skills.get(`blessing.${g.id}`).name}：信仰レベル3で習得（通常スキル・契約の解除でも消えない）`,
    "",
    heading("使徒の力（使徒だけが使える・信仰で進化）"),
    ap.map((s) => `${me && d.apostle.skills[s.id] ? "§a✓" : "§8・"}§r ${s.name}　§7信仰レベル${s.apostleFaith}以上§r`),
    "",
    heading("使徒になる条件"),
    `・信仰レベル${g.contract.faithLevel}以上　${f.level >= g.contract.faithLevel ? "§a✓" : "§c✗"}§r`,
    `・${g.name}の承認（神々の試練などで得る）　${d.flags[g.contract.approvalFlag] ? "§a✓" : "§c✗"}§r`,
    "・この神に使徒がいないこと（1柱につき1人）・ほかの神の使徒でないこと（1人1柱）",
    "§7使徒の契約が解除されると、使徒の力（進化分を含む）は失われます。信仰レベルと通常スキルは残ります。§r"
  );
}

const ACTION_JA = {
  "move.distance": "長い距離を旅する",
  "stage.clear": "ステージを攻略する",
  "kill.night": "夜に魔物を倒す",
  "kill.strong": "強敵を倒す",
  "kill.hostile": "魔物を倒す",
  "survive.lowhp": "瀕死から生き延びる",
  "magic.cast": "魔法を使う",
  "skill.learn": "スキルを学ぶ",
  "heal.amount": "仲間を癒す",
  "boss.kill": "ボスを倒す",
  "skill.fusion": "スキルを融合する",
  "protect.ally": "仲間を守る",
  "skill.link": "仲間と連携する",
  "rest.sleep": "眠る",
};

async function godPage(player, g) {
  for (;;) {
    const d = data(player);
    const extra = [];
    const me = d.apostle.god === g.id;
    if (d.flags[`god:${g.id}:offer`] && !d.apostle.god) extra.push({ label: "§6打診を受けて使徒になる", run: () => confirm(player, `${g.name}の使徒になりますか？\n現在の使徒は契約を解除されます。`, () => ctx.apostles.acceptOffer(player.id, g.id)) });
    else if (!me && !d.apostle.god) {
      const c = ctx.apostles.check(player.id, g.id);
      if (c.ok) extra.push({ label: "§6使徒契約を結ぶ", run: () => confirm(player, `${g.name}の使徒になりますか？\n（1人1柱まで。現在の信仰レベルから使徒の力を授かります）`, () => ctx.apostles.contract(player.id, g.id)) });
    }
    if (me) {
      for (const id of Object.keys(d.apostle.skills)) {
        const s = skills.get(id);
        if (s) extra.push({ label: `使徒の力：${s.name}`, run: () => showInfoPage(player, s.name, skillDetailText(d, s)) });
      }
      extra.push({ label: "§c使徒契約を解除する", run: () => confirm(player, "使徒契約を解除しますか？\n使徒の力（進化分を含む）はすべて失われ、割り当て・プリセットからも外れます。\n信仰レベルと通常スキルは残ります。再契約しても以前の使徒の力の成長は戻りません。", () => ctx.apostles.resign(player.id)) });
    }
    const r = await showInfoPage(player, g.name, godBody(d, g), extra);
    if (r !== "back" || extra.length === 0) return r;
  }
}

async function confirm(player, body, fn) {
  const c = await showForm(player, new MessageFormData().title("確認").body(body).button1("はい").button2("いいえ"));
  if (!c || c.selection !== 0) return;
  const r = fn();
  player.sendMessage(r && r.ok ? "§a完了しました。" : `§c${(r && r.reason) || "できませんでした"}`);
}

export const godsPage = {
  id: "gods",
  label: "神々・信仰",
  icon: "textures/items/totem",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    for (;;) {
      const d = data(player);
      const w = ctx.worldService.world;
      const list = gods.all();
      const form = new ActionFormData()
        .title("神々・信仰")
        .body(
          lines(
            "かつて魔神野口に敗れた24柱の神々。ある神は封印され、ある神は自ら迷宮の奥へ身を隠した。",
            `使徒契約：${d.apostle.god ? `§6${gods.get(d.apostle.god).name}の使徒§r` : "なし"}`,
            `神々の迷宮：${w.labyrinths.unlocked ? "§a解放済み§r（迷宮の中身は今後実装）" : "§7未解放（第3章のクリアで解放）§r"}`,
            ctx.apostles.offers(player.id).length ? `§6打診：${ctx.apostles.offers(player.id).map((id) => gods.get(id).name).join("・")}§r` : null
          )
        );
      for (const g of list) {
        const f = faithOf(d, g.id);
        const reg = w.apostles[g.id];
        form.button(`${g.name}（${g.domain}）\n§8信仰Lv${f.level}${reg ? `・使徒：${reg.uid === d.uid ? "あなた" : reg.name}` : ""}`);
      }
      form.button("§l戻る");
      form.button("閉じる");
      const res = await showForm(player, form);
      if (!res || res.selection === undefined || res.selection === list.length + 1) return "close";
      if (res.selection === list.length) return "back";
      if ((await godPage(player, list[res.selection])) === "close") return "close";
    }
  },
};
