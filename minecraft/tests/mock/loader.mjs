// @minecraft/server と @minecraft/server-ui をモックに差し替えるローダー
import { register } from "node:module";
register(
  "data:text/javascript," +
    encodeURIComponent(`
const MAP = {
  "@minecraft/server": ${JSON.stringify(new URL("./server.mjs", import.meta.url).href)},
  "@minecraft/server-ui": ${JSON.stringify(new URL("./server-ui.mjs", import.meta.url).href)},
};
export async function resolve(spec, ctx, next) {
  if (MAP[spec]) return { url: MAP[spec], shortCircuit: true };
  return next(spec, ctx);
}`)
);
