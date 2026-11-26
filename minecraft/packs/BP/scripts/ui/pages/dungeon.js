// ステージ情報（最終仕様：ランダムダンジョンを廃止し、100固定ステージへ）
// ※ ページIDは第1弾から "dungeon" のまま（メニューの並び順を変えないため）
import { ctx } from "../../core/context.js";
import { stages, chapters } from "../../content/index.js";
import { KINGDOM_PHASES, facilities } from "../../content/kingdom.js";
import { COMING_SOON, countKeys, heading, lines } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const dungeonPage = {
  id: "dungeon",
  label: "ステージ情報",
  icon: "textures/items/map_empty",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const w = ctx.worldService.world;
    const sum = ctx.stages.summary();
    const chapter = chapters.all().find((c) => c.number === w.story.chapter);
    const unlocked = stages.all().filter((s) => w.stages.unlocked[s.id]);
    const k = w.kingdom;
    const body = lines(
      heading("メインストーリー（ワールド共通）"),
      `${chapter ? chapter.title : `第${w.story.chapter}章`} / 全10章`,
      chapter && chapter.summary ? `§7${chapter.summary}§r` : null,
      `ステージ: 解放 ${sum.unlocked} / クリア ${sum.cleared} / 全${sum.total}`,
      unlocked.slice(-5).map((s) => {
        const r = w.stages.records[s.id];
        return `・${s.name}${s.defined ? "" : " §7(未制作)§r"} ${r && r.firstClearAt ? `§aクリア済(${r.clears}回)§r` : "§e未クリア§r"}`;
      }),
      "",
      heading("あなたの攻略記録"),
      `クリアしたステージ: ${countKeys(d.stageRecords)} 個（周回数は報酬に影響）`,
      "",
      heading("富里王国"),
      `状態: ${KINGDOM_PHASES[k.phase] ?? k.phase}  住民 ${countKeys(k.residents)}人  建物 ${countKeys(k.buildings)}棟`,
      `利用できる施設: ${Object.keys(k.facilities).map((f) => facilities.get(f)?.name ?? f).join("、")}`,
      "",
      `ステージへの移動・攻略・報酬 ${COMING_SOON}`,
      `§7※ ステージのマップ制作と攻略システムは第8弾・第17弾、王国の建物の配置は第15弾で実装します§r`
    );
    return showInfoPage(player, "ステージ情報", body);
  },
};
