// =============================================================
// サービスの組み立て（@minecraft/server に依存しない）
// main.js とテストの両方から使う。
// =============================================================
import { ChunkedStore } from "./storage/chunkedStore.js";
import { WorldService } from "./world/worldService.js";
import { PlayerService } from "./player/playerService.js";
import { PartyService } from "./party/partyService.js";
import { StatService, recalcData } from "./stats/statService.js";
import { TalentService } from "./talents/talentService.js";
import { ProgressionService } from "./progression/progressionService.js";
import { ActionService } from "./actions/actionService.js";
import { VitalsService } from "./vitals/vitalsService.js";
import { KingdomService } from "./kingdom/kingdomService.js";
import { StageService } from "./stages/stageService.js";
import { UniqueItemService } from "./unique/uniqueItemService.js";
import { SkillBindingService } from "./input/skillBindingService.js";
import { RewardService } from "./rewards/rewardService.js";
import { JobService } from "./job/jobService.js";
import { SkillService } from "./skills/skillService.js";
import { FaithService } from "./faith/faithService.js";
import { ApostleService } from "./apostle/apostleService.js";
import { KEY_PREFIX, SAVE } from "./config.js";

/**
 * @param {import("./storage/chunkedStore.js").StorageBackend} backend
 * @param {() => number} nowTick
 */
export function createApp(backend, nowTick) {
  const store = new ChunkedStore(backend, { prefix: KEY_PREFIX, chunkSize: SAVE.chunkSize, maxChunks: SAVE.maxChunks });
  const worldService = new WorldService(store);
  const playerService = new PlayerService(store, worldService);
  const partyService = new PartyService(playerService);
  const stats = new StatService(playerService, nowTick);
  const talents = new TalentService(playerService, worldService, nowTick);
  const progression = new ProgressionService(playerService, worldService, nowTick);
  const actions = new ActionService(playerService, talents);
  const vitals = new VitalsService(playerService);
  // --- 最終仕様 Ver.1.0 ---
  const kingdom = new KingdomService(worldService);
  const stages = new StageService(worldService, playerService, kingdom);
  const uniqueItems = new UniqueItemService(worldService, playerService);
  const skillBindings = new SkillBindingService(playerService, vitals, nowTick);
  const rewards = new RewardService(playerService, stages, uniqueItems);
  // --- 第3弾：職業 ---
  const jobs = new JobService(playerService, worldService, nowTick);
  // --- 第4弾：スキル・信仰・使徒 ---
  const skillService = new SkillService(playerService, worldService, nowTick);
  const faith = new FaithService(playerService, nowTick);
  const apostles = new ApostleService(playerService, worldService);
  skillBindings.skillService = skillService;
  skillBindings.faith = faith;
  skillBindings.actions = actions;
  jobs.afterChange = (pid) => skillService.evaluate(pid);
  faith.onLevelUp = (pid, god, level) => {
    apostles.onFaithLevel(pid, god, level);
    skillService.evaluate(pid);
  };
  actions.onRecorded = (pid, key, amount) => {
    jobs.onAction(pid, key, amount);
    faith.onAction(pid, key);
  };
  actions.onFlush = (pid) => {
    jobs.evaluateUnlocks(pid);
    skillService.evaluate(pid);
  };
  progression.onExpGranted = (pid, amount, levelsGained) => {
    if (amount > 0) jobs.onPlayerExp(pid, amount);
    if (levelsGained > 0) {
      jobs.evaluateUnlocks(pid);
      skillService.evaluate(pid);
    }
  };
  return {
    jobs, skillService, faith, apostles, store, worldService, playerService, partyService, stats, talents, progression, actions, vitals, kingdom, stages, uniqueItems, skillBindings, rewards, nowTick };
}

/**
 * 参加時の RPG 処理：参加 → 初期才能の抽選（初回のみ）→ 再計算 → 条件判定
 * @returns {{join: import("./player/playerService.js").JoinResult, rolled: string[]|null}}
 */
export function joinPlayer(app, player) {
  const join = app.playerService.join(player);
  if (join.alreadyJoined) return { join, rolled: null };
  const rolled = app.talents.ensureRolled(player.id);
  app.playerService.update(player.id, (d) => recalcData(d, app.nowTick()));
  app.talents.evaluate(player.id);
  app.jobs.evaluateUnlocks(player.id);
  // 第4弾：使徒契約の整合チェック（不在中の交代・剥奪を反映）→ スキルの習得判定（既存プレイヤーはスキルポイントを遡って付与）
  app.apostles.reconcile(player.id);
  app.skillService.evaluate(player.id);
  app.playerService.update(player.id, (d) => recalcData(d, app.nowTick()));
  return { join, rolled };
}
