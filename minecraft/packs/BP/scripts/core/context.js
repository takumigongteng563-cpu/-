// アドオン全体で共有するサービスの入れ物（起動時に main.js が設定する）
/**
 * @typedef {Object} AppContext
 * @property {import("../storage/chunkedStore.js").ChunkedStore} store
 * @property {import("../world/worldService.js").WorldService} worldService
 * @property {import("../player/playerService.js").PlayerService} playerService
 * @property {import("../party/partyService.js").PartyService} partyService
 * @property {import("../stats/statService.js").StatService} stats
 * @property {import("../talents/talentService.js").TalentService} talents
 * @property {import("../progression/progressionService.js").ProgressionService} progression
 * @property {import("../actions/actionService.js").ActionService} actions
 * @property {import("../vitals/vitalsService.js").VitalsService} vitals
 * @property {import("../kingdom/kingdomService.js").KingdomService} kingdom
 * @property {import("../stages/stageService.js").StageService} stages
 * @property {import("../unique/uniqueItemService.js").UniqueItemService} uniqueItems
 * @property {import("../input/skillBindingService.js").SkillBindingService} skillBindings
 * @property {import("../rewards/rewardService.js").RewardService} rewards
 * @property {import("../job/jobService.js").JobService} jobs
 * @property {import("../skills/skillService.js").SkillService} skillService
 * @property {import("../faith/faithService.js").FaithService} faith
 * @property {import("../apostle/apostleService.js").ApostleService} apostles
 * @property {() => number} nowTick 現在のtick
 * @property {boolean} ready
 */

/** @type {AppContext} */
export const ctx = {
  store: null,
  worldService: null,
  playerService: null,
  partyService: null,
  stats: null,
  talents: null,
  progression: null,
  actions: null,
  vitals: null,
  kingdom: null,
  stages: null,
  uniqueItems: null,
  skillBindings: null,
  rewards: null,
  jobs: null,
  skillService: null,
  faith: null,
  apostles: null,
  nowTick: () => 0,
  ready: false,
};
