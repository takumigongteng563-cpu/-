// =============================================================
// 演出：レベルアップ・才能獲得・才能進化・潜在能力覚醒・限界突破
// 内部イベント（core/eventBus.js）を受けて、メッセージ・タイトル・効果音・パーティクルを出す。
// 効果音・パーティクルの名前はバニラのもの。存在しない場合も例外で止まらないよう try で囲む。
// =============================================================
import { world, system } from "@minecraft/server";
import { on } from "../core/eventBus.js";
import { findPlayer } from "../core/players.js";
import { talents } from "../content/talents/index.js";
import { potentials } from "../content/potentials.js";
import { gradeLabel } from "../content/grades.js";
import { tierForStage } from "../content/tiers.js";
import { jobs } from "../content/jobs.js";
import { invalidateHud, notifyActionBar } from "../hud/hud.js";
import { skills } from "../content/skills.js";
import { gods } from "../content/gods.js";
import { HIDDEN_DISCOVERY_NOTICE } from "../balance/skills.js";
import { PLAYER_UID_PROPERTY } from "../player/playerService.js";

const skillName = (id) => skills.get(id)?.name ?? id;
const godName = (id) => gods.get(id)?.name ?? id;
const MASTERY_JA = { weapon: "武器熟練度", magic: "魔法熟練度" };

function tryDo(fn) {
  try {
    fn();
  } catch {
    // 演出の失敗はゲームに影響させない
  }
}

function sound(player, id, pitch = 1) {
  tryDo(() => player.playSound(id, { pitch, volume: 1 }));
}

function particles(player, id, count = 1) {
  tryDo(() => {
    const l = player.location;
    for (let i = 0; i < count; i++) {
      player.dimension.spawnParticle(id, { x: l.x + (Math.random() - 0.5), y: l.y + 1 + Math.random(), z: l.z + (Math.random() - 0.5) });
    }
  });
}

function title(player, main, sub, stay = 50) {
  tryDo(() => player.onScreenDisplay.setTitle(main, { subtitle: sub, fadeInDuration: 5, stayDuration: stay, fadeOutDuration: 15 }));
}

/** 演出は次のtickでまとめて行う（読み取り専用の場面から呼ばれても安全にするため） */
function later(playerId, fn) {
  system.run(() => {
    const p = findPlayer(playerId);
    if (p) tryDo(() => fn(p));
  });
}

export function registerEffects() {
  on("levelUp", (e) =>
    later(e.playerId, (p) => {
      title(p, `§6§lLEVEL UP!`, `§fLv ${e.from} → §e§lLv ${e.to}§r  §a能力ポイント +${e.points}`, 40);
      p.sendMessage(`§6レベルが ${e.to} に上がった！ §a能力ポイント +${e.points}§7（冒険者の書 → ステータス → 能力ポイント振り分け）`);
      sound(p, "random.levelup");
      particles(p, "minecraft:villager_happy", 8);
    })
  );

  on("talentAcquired", (e) =>
    later(e.playerId, (p) => {
      const t = talents.get(e.id);
      if (!t) return;
      title(p, `§b才能が目覚めた`, `${gradeLabel(t.grade)} §f${t.name}`, 50);
      p.sendMessage(`§b新たな才能「${t.name}」${gradeLabel(t.grade)}§b が目覚めた！ §7${t.description}`);
      sound(p, "random.orb", 0.7);
      particles(p, "minecraft:villager_happy", 6);
    })
  );

  on("talentEvolved", (e) =>
    later(e.playerId, (p) => {
      const from = talents.get(e.from);
      const to = talents.get(e.to);
      if (!to) return;
      title(p, `§d§l才能進化`, `§7${from?.name ?? e.from} → ${gradeLabel(to.grade)} §f${to.name}`, 60);
      p.sendMessage(`§d才能「${from?.name ?? e.from}」が「${to.name}」${gradeLabel(to.grade)}§d に進化した！`);
      sound(p, "random.anvil_use", 1.2);
      sound(p, "random.levelup", 1.5);
      particles(p, "minecraft:totem_particle", 10);
    })
  );

  on("potentialAwakened", (e) =>
    later(e.playerId, (p) => {
      const pot = potentials.get(e.id);
      if (!pot) return;
      title(p, `§5§l潜在能力 覚醒`, `§d§l${pot.name}`, 80);
      p.sendMessage(`§5§l眠っていた力が目覚めた…… §r§d「${pot.name}」§7 ${pot.description}`);
      sound(p, "random.totem");
      sound(p, "ambient.weather.thunder", 1.5);
      particles(p, "minecraft:totem_particle", 30);
      tryDo(() => world.sendMessage(`§5${p.name} の中で、何かが目覚めた……`));
    })
  );

  on("limitBreak", (e) =>
    later(e.playerId, (p) => {
      const t = tierForStage(e.to);
      title(p, `§e§l限界突破`, `§f存在階級「${t.name}」 §7（レベル上限 ${t.cap}）`, 80);
      p.sendMessage(`§e限界を超えた！ 存在階級が「${t.name}」になった。`);
      sound(p, "random.totem");
      particles(p, "minecraft:totem_particle", 30);
    })
  );

  // --- 第3弾：職業 ---
  on("jobChanged", (e) =>
    later(e.playerId, (p) => {
      const to = jobs.get(e.to);
      if (!to) return;
      const fusion = e.kind === "fusion";
      title(p, fusion ? "§6§l職業融合" : "§b§l転職", `§f${jobs.get(e.from)?.name ?? e.from} → §e§l${to.name}`, 60);
      p.sendMessage(`§6${to.name}§r になった！ §7${to.fusionText ?? ""}§r`);
      sound(p, fusion ? "random.totem" : "random.levelup", fusion ? 1.2 : 0.8);
      particles(p, fusion ? "minecraft:totem_particle" : "minecraft:villager_happy", fusion ? 20 : 8);
    })
  );
  on("jobLevelUp", (e) =>
    later(e.playerId, (p) => {
      p.sendMessage(`§b${jobs.get(e.jobId)?.name ?? e.jobId}の職業レベルが ${e.level} に上がった！`);
      sound(p, "random.orb", 1.4);
    })
  );
  on("jobUnlocked", (e) =>
    later(e.playerId, (p) => {
      p.sendMessage(`§a新たな職業「${jobs.get(e.jobId)?.name ?? e.jobId}」への道が開けた！ §7（冒険者の書 → 職業）`);
      sound(p, "random.orb", 0.8);
    })
  );
  on("hiddenJobDiscovered", (e) =>
    later(e.playerId, (p) => {
      title(p, "§5§l隠し職業 発見", `§d${jobs.get(e.jobId)?.name ?? e.jobId}`, 60);
      sound(p, "random.totem");
      particles(p, "minecraft:totem_particle", 15);
    })
  );

  // ---------------- 第4弾：スキル・信仰・使徒 ----------------
  on("skillLearned", (e) =>
    later(e.playerId, (p) => {
      if (e.method === "hidden") {
        title(p, "§d§lひらめき！", `§f${skillName(e.id)}`, 50);
        p.sendMessage(`${HIDDEN_DISCOVERY_NOTICE}§f${skillName(e.id)}`);
        sound(p, "random.totem");
      } else {
        p.sendMessage(`§bスキル習得：§f${skillName(e.id)}§7（冒険者の書 → スキル で割り当て）`);
        sound(p, "random.orb", 1.4);
      }
    })
  );
  on("skillPointsGained", (e) => later(e.playerId, (p) => p.sendMessage(`§aスキルポイント +${e.amount}`)));
  on("skillLevelUp", (e) =>
    later(e.playerId, (p) => {
      notifyActionBar(p, `§b${skillName(e.id)} §fが §eLv${e.level} §fに上がった！`, 40);
      sound(p, "random.orb", 1.8);
    })
  );
  on("skillEvolved", (e) =>
    later(e.playerId, (p) => {
      title(p, "§b§lスキル進化", `§f${skillName(e.from)} → §e${skillName(e.to)}`, 50);
      sound(p, "random.levelup", 1.2);
      particles(p, "minecraft:totem_particle", 10);
    })
  );
  on("skillFused", (e) =>
    later(e.playerId, (p) => {
      title(p, "§d§lスキル融合", `§e${skillName(e.output)}`, 50);
      sound(p, "random.anvil_use");
      particles(p, "minecraft:totem_particle", 10);
    })
  );
  on("masteryLevelUp", (e) => later(e.playerId, (p) => notifyActionBar(p, `§a${MASTERY_JA[e.kind]}（${e.key}）が Lv${e.level} に上がった`, 30)));
  on("faithLevelUp", (e) => later(e.playerId, (p) => p.sendMessage(`§e${godName(e.god)}§fへの信仰が §eLv${e.level}§f に深まった`)));
  on("apostleContracted", (e) =>
    later(e.playerId, (p) => {
      title(p, "§6§l使徒契約", `§f${godName(e.god)}の使徒となった`, 60);
      sound(p, "random.totem");
      particles(p, "minecraft:totem_particle", 20);
    })
  );
  on("apostleSkillEvolved", (e) => later(e.playerId, (p) => p.sendMessage(`§6使徒の力が目覚めた：§f${skillName(e.id)}`)));
  on("apostleOffer", (e) => later(e.playerId, (p) => p.sendMessage(`§6${godName(e.god)}§fがあなたを新たな使徒に選ぼうとしている（冒険者の書 → 神々・信仰）`)));
  on("apostleReleased", (e) => {
    for (const p of world.getAllPlayers()) {
      tryDo(() => {
        if (p.getDynamicProperty(PLAYER_UID_PROPERTY) === e.uid) p.sendMessage(`§7${godName(e.god)}の使徒契約が解除された。使徒の力は失われた（信仰レベルと通常スキルは残る）`);
      });
    }
  });

  for (const name of ["statsChanged", "vitalsChanged", "expGained", "jobChanged", "jobLevelUp", "skillUsed", "skillLevelUp", "skillCastStart", "skillCastCancel"]) {
    on(name, (e) => {
      if (e && e.playerId) invalidateHud(e.playerId);
    });
  }
}
