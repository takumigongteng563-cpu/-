// ワールドの動的プロパティを保存先として使う backend
import { world } from "@minecraft/server";

/** @type {import("./chunkedStore.js").StorageBackend} */
export const worldBackend = {
  get(key) {
    return world.getDynamicProperty(key);
  },
  set(key, value) {
    world.setDynamicProperty(key, value);
  },
};

/** 診断用：動的プロパティの合計バイト数 */
export function worldStorageBytes() {
  try {
    return world.getDynamicPropertyTotalByteCount();
  } catch {
    return -1;
  }
}

/** 診断用：このアドオンが使っているキー数 */
export function countKeys(prefix) {
  try {
    return world.getDynamicPropertyIds().filter((k) => k.startsWith(prefix + ":")).length;
  } catch {
    return -1;
  }
}
