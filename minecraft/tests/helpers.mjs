// テスト用の共通部品（@minecraft/server を使わない純粋ロジックのテスト用）
import { ChunkedStore } from "../packs/BP/scripts/storage/chunkedStore.js";
import { WorldService } from "../packs/BP/scripts/world/worldService.js";
import { PlayerService } from "../packs/BP/scripts/player/playerService.js";
import { setLogLevel } from "../packs/BP/scripts/core/log.js";

setLogLevel("error");
// テスト中のエラーログを黙らせる（検証は戻り値で行う）
console.error = () => {};
console.warn = () => {};

/** 動的プロパティ相当のメモリ保存先（実機の上限 32767 バイトを再現） */
export function memoryBackend(map = new Map()) {
  return {
    map,
    writes: 0,
    get(key) {
      return map.get(key);
    },
    set(key, value) {
      if (value === undefined) {
        map.delete(key);
        return;
      }
      if (typeof value === "string" && Buffer.byteLength(value, "utf8") > 32767) throw new Error("too long");
      this.writes++;
      map.set(key, value);
    },
  };
}

export function makeStore(backend, chunkSize = 16000) {
  return new ChunkedStore(backend, { prefix: "mnq", chunkSize, maxChunks: 64 });
}

/** Minecraft の Player の代わり（id・名前・動的プロパティのみ） */
export function fakePlayer(id, name, props = new Map()) {
  return {
    id,
    name,
    props,
    getDynamicProperty(k) {
      return props.get(k);
    },
    setDynamicProperty(k, v) {
      if (v === undefined) props.delete(k);
      else props.set(k, v);
    },
  };
}

/** ワールド起動 = サービスを新しく作り直して読み込む */
export function bootWorld(backend) {
  const store = makeStore(backend);
  const ws = new WorldService(store);
  ws.load();
  const ps = new PlayerService(store, ws);
  return { store, ws, ps };
}
