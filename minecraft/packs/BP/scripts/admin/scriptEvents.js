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
// =============================================================
import { system, world, Player } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { subscribe } from "../core/events.js";
import { NAMESPACE, KEY_PREFIX, ADDON_VERSION } from "../config.js";
import { flushAll, pendingCount } from "../storage/saveManager.js";
import { worldStorageBytes, countKeys } from "../storage/worldBackend.js";
import { ensureAdventurerBook } from "../items/adventurerBook.js";

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
      default:
        reply(ev, `§c不明なコマンド: ${ev.id}`);
    }
  });
}
