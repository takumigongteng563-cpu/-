// 第2弾（RPG）テスト用の共通部品
import { memoryBackend, fakePlayer } from "./helpers.mjs";
import { createApp, joinPlayer } from "../packs/BP/scripts/app.js";

export { memoryBackend, fakePlayer };

/** ワールド起動 + 共有tick */
export function boot(backend = memoryBackend(), tickRef = { t: 0 }) {
  const app = createApp(backend, () => tickRef.t);
  app.worldService.load();
  return { app, backend, tickRef };
}

export function join(app, id, name) {
  const p = fakePlayer(id, name);
  joinPlayer(app, p);
  return p;
}

/** 才能を空にした素の状態にする（計算の検証用） */
export function stripTalents(app, playerId) {
  app.playerService.update(playerId, (d) => {
    d.talents.active = [];
    d.hiddenPotential.entries = [];
  });
  app.stats.recalc(playerId);
}
