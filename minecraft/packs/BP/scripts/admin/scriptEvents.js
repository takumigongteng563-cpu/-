// =============================================================
// 管理・デバッグ用コマンド（/scriptevent）
// /scriptevent はチートが有効な環境で、権限のあるプレイヤーのみ実行できる。
//
//   /scriptevent noguchi:menu          実行者のメニューを開く
//   /scriptevent noguchi:give_book     実行者に冒険者の書を渡す
//   /scriptevent noguchi:save          全データを即時保存
//   /scriptevent noguchi:status        データ状態をチャットに表示
//   /scriptevent noguchi:restrict <break|place|interact> <on|off>
//   /scriptevent noguchi:dump          実行者の個人データをコンテンツログに出力（外部バックアップ用）
//   /scriptevent noguchi:dump_world    ワールド共有データをコンテンツログに出力
//
// 【第2弾：管理者テスト用】プレイヤーが実行する場合は管理者タグ（noguchi_admin）が必要。
// 最後の引数にオンラインのプレイヤー名を書くと、そのプレイヤーが対象になる（省略時は実行者）。
//   /scriptevent noguchi:exp <量> [名前]           経験値付与
//   /scriptevent noguchi:level <レベル> [名前]     レベル設定
//   /scriptevent noguchi:points <数> [名前]        能力ポイント付与
//   /scriptevent noguchi:vital <hp|mp|stamina> <値> [名前]
//   /scriptevent noguchi:talent <才能ID> [名前]    才能付与
//   /scriptevent noguchi:evolve <才能ID> [進化先ID] [名前]  才能進化テスト
//   /scriptevent noguchi:awaken [潜在能力ID] [名前]          潜在能力覚醒テスト
//   /scriptevent noguchi:limitbreak [名前]         限界突破テスト（条件無視）
//   /scriptevent noguchi:recalc [名前]             ステータス再計算
//   /scriptevent noguchi:flag <フラグID> [名前]    特殊イベントのフラグを立てる
//
// 【最終仕様対応：管理者テスト用】
//   /scriptevent noguchi:give_focus                操作判定の確認用アイテム「修練の触媒」を受け取る
//   /scriptevent noguchi:input_test <on|off>       操作判定テスト（使用時に判定結果を表示）
//   /scriptevent noguchi:stage_clear <番号>         ステージクリアの記録テスト（復興・解放処理の確認）
//
// 【第3弾：職業（管理者テスト用）】
//   /scriptevent noguchi:job <職業ID> [名前]        無条件転職（例：warrior.mage.mage）
//   /scriptevent noguchi:joblevel <レベル> [名前]   現在の職業の職業レベル設定
//   /scriptevent noguchi:jobexp <量> [名前]         職業経験値付与
//   /scriptevent noguchi:jobtoken <個数> [名前]     転職の証を付与
//   /scriptevent noguchi:jobcheck                   職業データの自動検証
// =============================================================
import { system, world, Player } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { subscribe } from "../core/events.js";
import { NAMESPACE, KEY_PREFIX, ADDON_VERSION } from "../config.js";
import { flushAll, pendingCount } from "../storage/saveManager.js";
import { worldStorageBytes, countKeys } from "../storage/worldBackend.js";
import { ensureAdventurerBook, giveSkillFocus } from "../items/adventurerBook.js";
import { stageIdOf } from "../content/stages.js";
import { validateJobs } from "../content/jobs/validateJobs.js";
import { validateSkills } from "../content/skills/validateSkills.js";
import { TAGS } from "../config.js";
import { isAdmin } from "./adminAuth.js";

// 第2弾のテスト用コマンド（第1弾のコマンドは従来どおり /scriptevent の実行権限のみで使える）
const ADMIN_COMMANDS = new Set(["exp", "level", "points", "vital", "talent", "evolve", "awaken", "limitbreak", "recalc", "flag", "give_focus", "input_test", "stage_clear", "job", "joblevel", "jobexp", "jobtoken", "jobcheck", "skill", "skilllevel", "sp", "faith", "apostle", "apostle_release", "skillcheck", "cd_reset"]);
const TARGETED = ["exp", "level", "points", "vital", "talent", "evolve", "awaken", "limitbreak", "recalc", "flag", "job", "joblevel", "jobexp", "jobtoken", "skill", "skilllevel", "sp", "faith", "apostle", "cd_reset"];

/** 最後の引数がオンラインのプレイヤー名ならそのプレイヤー、違えば実行者 */
function resolveTarget(args, src) {
  const last = args[args.length - 1];
  if (last) {
    const p = world.getAllPlayers().find((x) => x.name === last);
    if (p) {
      args.pop();
      return p;
    }
  }
  return src;
}

function result(ev, label, res) {
  const ok = res === true || (res && res.ok);
  reply(ev, ok ? `§a${label}：成功` : `§c${label}：失敗 ${res && res.reason ? res.reason : ""}`);
}

const RESTRICT_KEYS = { break: "blockBreak", place: "blockPlace", interact: "blockInteract" };

function reply(ev, text) {
  const src = ev.sourceEntity;
  if (src instanceof Player) src.sendMessage(text);
  else world.sendMessage(text);
}

/** 長い文字列をコンテンツログへ分割出力 */
function dumpToLog(label, obj) {
  const text = JSON.stringify(obj);
  const size = 4000;
  const parts = Math.ceil(text.length / size);
  for (let i = 0; i < parts; i++) {
    console.warn(`[魔神野口][DUMP][${label}][${i + 1}/${parts}] ${text.slice(i * size, (i + 1) * size)}`);
  }
  return parts;
}

/**
 * @param {{openMenu: (p: any) => void}} hooks
 */
export function registerScriptEvents(hooks) {
  subscribe(system.afterEvents.scriptEventReceive, "scriptEvent", (ev) => {
    if (!ev.id.startsWith(`${NAMESPACE}:`)) return;
    const cmd = ev.id.slice(NAMESPACE.length + 1);
    const args = ev.message.trim().split(/\s+/).filter(Boolean);
    const src = ev.sourceEntity instanceof Player ? ev.sourceEntity : undefined;
    if (!ctx.ready) {
      reply(ev, "§eデータを準備中です。");
      return;
    }
    if (ADMIN_COMMANDS.has(cmd) && src && !isAdmin(src)) {
      reply(ev, "§cこのコマンドは管理者（noguchi_admin タグ）専用です。");
      return;
    }
    const target = TARGETED.includes(cmd) ? resolveTarget(args, src) : src;
    if (target === undefined && TARGETED.includes(cmd)) {
      reply(ev, "§c対象のプレイヤーを指定してください。");
      return;
    }

    switch (cmd) {
      case "menu":
        if (src) hooks.openMenu(src);
        return;
      case "give_book":
        if (src) {
          const r = ensureAdventurerBook(src);
          reply(ev, r === "has" ? "§7すでに冒険者の書を持っています。" : r === "given" ? "§a冒険者の書を渡しました。" : "§c渡せませんでした。");
        }
        return;
      case "save": {
        const n = flushAll("scriptevent");
        reply(ev, `§a保存しました（${n}件）。`);
        return;
      }
      case "status": {
        const players = ctx.playerService.onlineSessions();
        reply(
          ev,
          [
            `§6[魔神野口] v${ADDON_VERSION}`,
            `オンライン: ${players.map((s) => s.name).join(", ") || "なし"}`,
            `登録プレイヤー: ${Object.keys(ctx.worldService.index.players).length}`,
            `保存待ち: ${pendingCount()}件 / 保存領域 ${worldStorageBytes()}バイト / キー ${countKeys(KEY_PREFIX)}個`,
            `行動制限: ${JSON.stringify(ctx.worldService.world.settings.restrictions)}`,
          ].join("\n")
        );
        return;
      }
      case "restrict": {
        const key = RESTRICT_KEYS[args[0]];
        const val = args[1] === "on" ? true : args[1] === "off" ? false : undefined;
        if (!key || val === undefined) {
          reply(ev, "§c使い方: /scriptevent noguchi:restrict <break|place|interact> <on|off>");
          return;
        }
        ctx.worldService.updateWorld((w) => {
          w.settings.restrictions[key] = val;
        }, { important: true });
        reply(ev, `§a行動制限 ${args[0]} を ${val ? "ON" : "OFF"} にしました。`);
        return;
      }
      case "dump": {
        if (!src) return;
        const d = ctx.playerService.dataFor(src.id);
        const n = dumpToLog(`player:${d ? d.uid : "?"}`, d);
        reply(ev, `§aコンテンツログに出力しました（${n}行）。`);
        return;
      }
      case "dump_world": {
        const n = dumpToLog("world", { world: ctx.worldService.world, index: ctx.worldService.index });
        reply(ev, `§aコンテンツログに出力しました（${n}行）。`);
        return;
      }
      case "exp":
        result(ev, `経験値 ${args[0]}`, ctx.progression.grantExp(target.id, Number(args[0]), { source: "admin", noBonus: true }));
        return;
      case "level":
        result(ev, `レベル ${args[0]}`, ctx.progression.setLevel(target.id, Number(args[0])));
        return;
      case "points":
        result(ev, `能力ポイント ${args[0]}`, ctx.progression.addStatPoints(target.id, Number(args[0])));
        return;
      case "vital":
        if (!["hp", "mp", "stamina"].includes(args[0]) || !Number.isFinite(Number(args[1]))) {
          reply(ev, "§c使い方: /scriptevent noguchi:vital <hp|mp|stamina> <値> [名前]");
          return;
        }
        result(ev, `${args[0]}=${args[1]}`, ctx.vitals.setValue(target.id, args[0], Number(args[1])));
        return;
      case "talent":
        result(ev, `才能 ${args[0]}`, ctx.talents.grant(target.id, args[0]));
        return;
      case "evolve":
        result(ev, `進化 ${args[0]}`, ctx.talents.forceEvolve(target.id, args[0], args[1]));
        return;
      case "awaken":
        result(ev, "潜在能力覚醒", ctx.talents.forceAwaken(target.id, args[0]));
        return;
      case "limitbreak":
        result(ev, "限界突破", ctx.progression.limitBreak(target.id, { force: true, by: `admin:${src ? src.name : "command"}` }));
        return;
      case "recalc":
        result(ev, "再計算", ctx.stats.recalc(target.id, { important: true }));
        return;
      case "flag":
        result(ev, `フラグ ${args[0]}`, args[0] ? ctx.actions.setFlag(target.id, args[0]) : false);
        return;
      case "give_focus":
        if (src) result(ev, "技の触媒", giveSkillFocus(src, Number(args[0]) || 1) > 0);
        return;
      case "input_test":
        if (!src) return;
        if (args[0] === "off") src.removeTag(TAGS.inputTest);
        else src.addTag(TAGS.inputTest);
        reply(ev, `§a操作判定テスト：${args[0] === "off" ? "OFF" : "ON（技の触媒を使うと判定結果を表示）"}`);
        return;
      case "stage_clear": {
        const n = Number(args[0]);
        if (!(n >= 1 && n <= 110)) {
          reply(ev, "§c使い方: /scriptevent noguchi:stage_clear <1～110>");
          return;
        }
        const ids = world.getAllPlayers().filter((p) => ctx.playerService.getSession(p.id)).map((p) => p.id);
        const r = ctx.stages.recordClear(stageIdOf(n), ids);
        result(ev, `ステージ${n} クリア記録${r.first ? "（初回）" : ""}${r.unlockedNext ? ` → ${r.unlockedNext} 解放` : ""}`, r);
        return;
      }
      case "job":
        result(ev, `無条件転職 ${args[0]}`, ctx.jobs.changeJob(target.id, args[0], { force: true, by: `admin:${src ? src.name : "command"}` }));
        return;
      case "joblevel":
        result(ev, `職業レベル ${args[0]}`, ctx.jobs.setJobLevel(target.id, Number(args[0])));
        return;
      case "jobexp":
        result(ev, `職業経験値 ${args[0]}（+${ctx.jobs.addJobExp(target.id, Number(args[0]))}レベル）`, true);
        return;
      case "jobtoken":
        result(ev, `転職の証 ×${args[0]}`, ctx.jobs.addCrossLineToken(target.id, Number(args[0]) || 1));
        return;
      case "jobcheck": {
        const r = validateJobs();
        reply(ev, `${r.ok ? "§a" : "§c"}職業データの自動検証：${r.ok ? "合格" : "不合格"}（${r.checks.filter((c) => c.ok).length}/${r.checks.length}項目）`);
        for (const e of r.errors.slice(0, 5)) reply(ev, `§c${e}`);
        return;
      }
      // ---------------- 第4弾：スキル・信仰・使徒（管理者テスト） ----------------
      case "skill":
        result(ev, `スキル付与 ${args[0]}`, ctx.skillService.grant(target.id, args[0]));
        return;
      case "skilllevel":
        result(ev, `スキルレベル ${args[0]} → ${args[1]}`, ctx.skillService.setLevel(target.id, args[0], Number(args[1])));
        return;
      case "sp":
        result(ev, `スキルポイント +${args[0]}`, ctx.playerService.update(target.id, (d) => (d.skills.points += Math.max(0, Math.floor(Number(args[0]) || 0))), { important: true }));
        return;
      case "faith":
        result(ev, `信仰レベル ${args[0]} → ${args[1]}`, ctx.faith.setLevel(target.id, args[0], Number(args[1])));
        return;
      case "apostle":
        result(ev, `使徒契約 ${args[0]}（条件を無視）`, ctx.apostles.contract(target.id, args[0], { force: true, replace: args[1] === "replace" }));
        return;
      case "apostle_release":
        result(ev, `使徒契約の解除 ${args[0]}`, ctx.apostles.release(args[0], "admin"));
        return;
      case "cd_reset":
        ctx.skillBindings.resetCooldowns(target.id);
        result(ev, "クールタイム解除", true);
        return;
      case "skillcheck": {
        const r = validateSkills();
        reply(ev, `${r.ok ? "§a" : "§c"}スキルデータの自動検証：${r.ok ? "合格" : "不合格"}（${r.checks.filter((c) => c.ok).length}/${r.checks.length}項目・${r.stats.total}種）`);
        for (const e of r.errors.slice(0, 5)) reply(ev, `§c${e}`);
        return;
      }
      default:
        reply(ev, `§c不明なコマンド: ${ev.id}`);
    }
  });
}
