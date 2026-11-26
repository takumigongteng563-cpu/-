// =============================================================
// HUD：アクションバーに HP・MP・スタミナ・レベル・経験値・職業を表示する
// ・統合版標準のアクションバーを使う（独自UIやリソースパックのHUD改造は使わない）
// ・表示内容が変わったとき、または一定間隔でのみ再表示（毎tickは更新しない）
// ・ほかの通知をアクションバーに出したときは少しの間 HUD を出さない
// =============================================================
import { world, system } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { every } from "../core/scheduler.js";
import { HUD } from "../balance/hud.js";
import { jobs } from "../content/jobs.js";
import { expToNext } from "../progression/levelMath.js";
import { levelCapForStage } from "../content/tiers.js";

/** @type {Map<string, {text: string, at: number, yieldUntil: number}>} */
const state = new Map();

function st(playerId) {
  let s = state.get(playerId);
  if (!s) {
    s = { text: "", at: 0, yieldUntil: 0 };
    state.set(playerId, s);
  }
  return s;
}

/**
 * HUD 以外のアクションバー表示（通知）。表示後しばらく HUD を止める
 * @param {number} [yieldTicks] HUD を止める時間（省略時は設定値）
 */
export function notifyActionBar(player, text, yieldTicks = HUD.yieldTicks) {
  try {
    player.onScreenDisplay.setActionBar(text);
    const s = st(player.id);
    s.yieldUntil = system.currentTick + yieldTicks;
    s.text = "";
  } catch {
    // 無視
  }
}

export function hudText(d) {
  const v = d.vitals;
  const cap = levelCapForStage(d.limitBreak.stage);
  const exp = d.level >= cap ? "§6MAX" : `${Math.floor(d.exp)}/${expToNext(d.level, d.limitBreak.stage)}`;
  const jl = d.job.levels[d.job.current];
  const job = `${jobs.get(d.job.current)?.name ?? d.job.current}${jl && d.job.current !== "unemployed" ? ` Lv${jl.level}` : ""}`;
  const ex = v.exhausted ? "§c" : "§e";
  return (
    `§cHP ${Math.round(v.hp)}/${v.hpMax}  §9MP ${Math.floor(v.mp)}/${v.mpMax}  ${ex}ST ${Math.floor(v.stamina)}/${v.staminaMax}` +
    `\n§fLv ${d.level}  §7EXP ${exp}  §f${job}` +
    (d.unspentStatPoints > 0 ? `  §a+${d.unspentStatPoints}pt` : "")
  );
}

function update() {
  if (!ctx.ready) return;
  const now = system.currentTick;
  for (const p of world.getAllPlayers()) {
    const d = ctx.playerService.dataFor(p.id);
    if (!d || d.settings.hud === false) continue;
    const s = st(p.id);
    if (now < s.yieldUntil) continue;
    const text = hudText(d);
    if (text === s.text && now - s.at < HUD.refreshIntervalTicks) continue;
    p.onScreenDisplay.setActionBar(text);
    s.text = text;
    s.at = now;
  }
}

/** 変化があったプレイヤーの HUD を次回の確認で必ず更新させる */
export function invalidateHud(playerId) {
  const s = state.get(playerId);
  if (s) s.text = "";
}

export function forgetHud(playerId) {
  state.delete(playerId);
}

export function registerHud() {
  every("hud", HUD.checkIntervalTicks, update);
}
