// =============================================================
// @minecraft/server のテスト用モック（Node.js 上で main.js を動かすため）
// 実機の挙動を完全には再現しない。アドオンが使う範囲のみ。
// ・before イベント中は読み取り専用（書き込み系APIは例外）を再現
// ・動的プロパティの文字列上限（32767バイト）を再現
// =============================================================

let readOnly = false;
function assertWritable(what) {
  if (readOnly) throw new Error(`[mock] 読み取り専用モード中に ${what} は呼べません`);
}

class Signal {
  constructor(isBefore = false) {
    this.handlers = [];
    this.isBefore = isBefore;
  }
  subscribe(fn) {
    this.handlers.push(fn);
    return fn;
  }
  unsubscribe(fn) {
    this.handlers = this.handlers.filter((h) => h !== fn);
  }
  fire(ev) {
    for (const h of this.handlers) {
      if (this.isBefore) readOnly = true;
      try {
        h(ev);
      } finally {
        readOnly = false;
      }
    }
    return ev;
  }
}

export const ItemLockMode = { inventory: "inventory", none: "none", slot: "slot" };
export const EntityComponentTypes = { Inventory: "minecraft:inventory", Health: "minecraft:health", IsTamed: "minecraft:is_tamed", Tameable: "minecraft:tameable" };
export const EntityDamageCause = { entityAttack: "entityAttack", magic: "magic" };
export const GameMode = { Adventure: "Adventure", Creative: "Creative", Spectator: "Spectator", Survival: "Survival" };

const KNOWN_BLOCKS = new Set(["minecraft:stone", "minecraft:dirt", "minecraft:crafting_table"]);
export const BlockTypes = {
  get(id) {
    return KNOWN_BLOCKS.has(id) ? { id } : undefined;
  },
};

export class ItemStack {
  constructor(typeId, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
    this.lockMode = ItemLockMode.none;
    this.keepOnDeath = false;
    this._lore = [];
  }
  setLore(l) {
    this._lore = [...l];
  }
  getLore() {
    return [...this._lore];
  }
}

class Container {
  constructor(size) {
    this.size = size;
    this.slots = new Array(size).fill(undefined);
  }
  getItem(i) {
    return this.slots[i];
  }
  setItem(i, it) {
    assertWritable("setItem");
    this.slots[i] = it;
  }
  addItem(it) {
    assertWritable("addItem");
    const i = this.slots.findIndex((s) => s === undefined);
    if (i < 0) return it;
    this.slots[i] = it;
    return undefined;
  }
}

function checkValue(v) {
  if (typeof v === "string" && Buffer.byteLength(v, "utf8") > 32767) throw new Error("[mock] 動的プロパティの文字列が長すぎます");
}

class HealthComponent {
  constructor(owner, max) {
    this.owner = owner;
    this.effectiveMax = max;
    this.effectiveMin = 0;
    this.defaultValue = max;
    this.currentValue = max;
  }
  setCurrentValue(v) {
    assertWritable("health.setCurrentValue");
    const old = this.currentValue;
    this.currentValue = Math.max(0, Math.min(this.effectiveMax, v));
    if (old !== this.currentValue) world.afterEvents.entityHealthChanged.fire({ entity: this.owner, oldValue: old, newValue: this.currentValue });
    return true;
  }
  resetToMaxValue() {
    this.setCurrentValue(this.effectiveMax);
  }
}

/** 第4弾：スキルの範囲判定用のエンティティ一覧（プレイヤーを除く） */
const mobs = [];
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
function queryMatch(e, opt) {
  if (!e.isValid) return false;
  if (opt.type && e.typeId !== opt.type) return false;
  if (opt.families && !opt.families.every((f) => e.families.includes(f))) return false;
  if (opt.excludeFamilies && opt.excludeFamilies.some((f) => e.families.includes(f))) return false;
  if (opt.excludeTypes && opt.excludeTypes.includes(e.typeId)) return false;
  if (opt.tags && !opt.tags.every((t) => e.tags.has(t))) return false;
  if (opt.excludeTags && opt.excludeTags.some((t) => e.tags.has(t))) return false;
  if (opt.location && opt.maxDistance !== undefined && d2(e.location, opt.location) > opt.maxDistance ** 2) return false;
  return true;
}

const dimension = {
  id: "minecraft:overworld",
  particles: [],
  sounds: [],
  spawnParticle(id, loc) {
    assertWritable("spawnParticle");
    this.particles.push(id);
  },
  playSound(id) {
    assertWritable("dimension.playSound");
    this.sounds.push(id);
  },
  getEntities(opt = {}) {
    return [...players, ...mobs].filter((e) => queryMatch(e, opt));
  },
  spawnEntity(typeId, loc) {
    assertWritable("spawnEntity");
    const e = new Entity(typeId, typeId === "minecraft:wolf" ? ["wolf", "mob"] : ["mob"]);
    e.location = { ...loc };
    mobs.push(e);
    return e;
  },
  getBlock() {
    return { isAir: true };
  },
};

let entitySeq = 1;
export class Entity {
  constructor(typeId, families = []) {
    this.typeId = typeId;
    this.id = String(1000 + entitySeq++);
    this.families = families;
    this.isValid = true;
    this.location = { x: 0, y: 64, z: 0 };
    this.dimension = dimension;
    this.health = new HealthComponent(this, 20);
    this.tags = new Set();
    this.effects = [];
    this.damageLog = [];
    this.knockback = 0;
  }
  matches(opt) {
    if (opt.families) return opt.families.every((f) => this.families.includes(f));
    return true;
  }
  getComponent(id) {
    return id === EntityComponentTypes.Health ? this.health : undefined;
  }
  addTag(t) {
    this.tags.add(t);
    return true;
  }
  hasTag(t) {
    return this.tags.has(t);
  }
  removeTag(t) {
    return this.tags.delete(t);
  }
  applyDamage(amount, opt = {}) {
    assertWritable("applyDamage");
    if (!this.isValid) return false;
    this.damageLog.push({ amount, cause: opt.cause, by: opt.damagingEntity && opt.damagingEntity.id });
    this.health.setCurrentValue(this.health.currentValue - amount);
    if (this.health.currentValue <= 0 && this.typeId !== "minecraft:player") {
      this.isValid = false;
      world.afterEvents.entityDie.fire({ deadEntity: this, damageSource: { cause: opt.cause, damagingEntity: opt.damagingEntity } });
    }
    return true;
  }
  applyKnockback(h, v) {
    assertWritable("applyKnockback");
    this.knockback += Math.hypot(h.x, h.z) + v;
  }
  addEffect(id, duration, opt) {
    assertWritable("addEffect");
    this.effects.push({ id, duration, amplifier: opt && opt.amplifier });
  }
  removeEffect(id) {
    this.effects = this.effects.filter((e) => e.id !== id);
    return true;
  }
  teleport(loc) {
    assertWritable("teleport");
    this.location = { ...loc };
  }
  remove() {
    assertWritable("remove");
    this.isValid = false;
  }
  getHeadLocation() {
    return { x: this.location.x, y: this.location.y + 1.6, z: this.location.z };
  }
  getViewDirection() {
    return this.viewDirection || { x: 0, y: 0, z: 1 };
  }
  /** 視線（+z 方向など）の前方にいるエンティティ（近い順） */
  getEntitiesFromViewDirection(opt = {}) {
    const dir = this.getViewDirection();
    const max = opt.maxDistance ?? 64;
    return [...players, ...mobs]
      .filter((e) => e !== this && queryMatch(e, { ...opt, location: undefined, maxDistance: undefined }))
      .map((e) => {
        const v = { x: e.location.x - this.location.x, y: e.location.y - this.location.y, z: e.location.z - this.location.z };
        const along = v.x * dir.x + v.y * dir.y + v.z * dir.z;
        const off = Math.sqrt(Math.max(0, d2(e.location, this.location) - along * along));
        return { entity: e, distance: along, off };
      })
      .filter((h) => h.distance > 0 && h.distance <= max && h.off <= 1.5)
      .sort((a, b) => a.distance - b.distance)
      .map(({ entity, distance }) => ({ entity, distance }));
  }
  getBlockFromViewDirection() {
    return undefined;
  }
}

export class Player extends Entity {
  constructor(id, name, props = {}) {
    super("minecraft:player", ["player", "mob"]);
    this.id = id;
    this.name = name;
    this.typeId = "minecraft:player";
    this.isValid = true;
    this.props = new Map(Object.entries(props));
    this.tags = new Set();
    this.messages = [];
    this.actionBar = [];
    this.gameMode = GameMode.Survival;
    this.selectedSlotIndex = 0;
    this.inventory = new Container(36);
    this.isSprinting = false;
    this.isSneaking = false;
    this.isSleeping = false;
    this.isJumping = false;
    this.isOnGround = true;
    this.sounds = [];
    this.titles = [];
    this.effects = [];
    const self = this;
    this.onScreenDisplay = {
      setActionBar(t) {
        assertWritable("setActionBar");
        self.actionBar.push(t);
      },
      setTitle(t, opt) {
        assertWritable("setTitle");
        self.titles.push({ title: t, subtitle: opt && opt.subtitle });
      },
    };
  }
  getDynamicProperty(k) {
    return this.props.get(k);
  }
  setDynamicProperty(k, v) {
    assertWritable("setDynamicProperty");
    checkValue(v);
    if (v === undefined) this.props.delete(k);
    else this.props.set(k, v);
  }
  getComponent(id) {
    if (id === EntityComponentTypes.Health) return this.health;
    return id === EntityComponentTypes.Inventory ? { container: this.inventory } : undefined;
  }
  playSound(id) {
    assertWritable("playSound");
    this.sounds.push(id);
  }
  addEffect(id, duration, opt) {
    assertWritable("addEffect");
    this.effects.push({ id, duration, amplifier: opt && opt.amplifier });
  }
  sendMessage(m) {
    assertWritable("sendMessage");
    this.messages.push(typeof m === "string" ? m : JSON.stringify(m));
  }
  hasTag(t) {
    return this.tags.has(t);
  }
  addTag(t) {
    this.tags.add(t);
    return true;
  }
  removeTag(t) {
    return this.tags.delete(t);
  }
  getGameMode() {
    return this.gameMode;
  }
}

const worldProps = new Map();
const players = [];

export const world = {
  afterEvents: {
    worldLoad: new Signal(),
    playerSpawn: new Signal(),
    playerLeave: new Signal(),
    itemUse: new Signal(),
    entityDie: new Signal(),
    entityHitEntity: new Signal(),
    entityHurt: new Signal(),
    entityHealthChanged: new Signal(),
    projectileHitEntity: new Signal(),
    itemStartUse: new Signal(),
    itemReleaseUse: new Signal(),
    itemStopUse: new Signal(),
  },
  timeOfDay: 6000,
  getTimeOfDay() {
    return this.timeOfDay;
  },
  beforeEvents: {
    playerBreakBlock: new Signal(true),
    playerInteractWithBlock: new Signal(true),
  },
  broadcast: [],
  getDynamicProperty(k) {
    return worldProps.get(k);
  },
  setDynamicProperty(k, v) {
    assertWritable("world.setDynamicProperty");
    checkValue(v);
    if (v === undefined) worldProps.delete(k);
    else worldProps.set(k, v);
  },
  getDynamicPropertyIds() {
    return [...worldProps.keys()];
  },
  getDynamicPropertyTotalByteCount() {
    let n = 0;
    for (const v of worldProps.values()) n += typeof v === "string" ? Buffer.byteLength(v) : 8;
    return n;
  },
  getDimension() {
    return dimension;
  },
  playSound() {},
  getAllPlayers() {
    return players.filter((p) => p.isValid);
  },
  getPlayers() {
    return this.getAllPlayers();
  },
  sendMessage(m) {
    assertWritable("world.sendMessage");
    this.broadcast.push(m);
    for (const p of this.getAllPlayers()) p.messages.push(m);
  },
};

// ---- system（tick を手動で進める） ----
let currentTick = 0;
let nextId = 1;
const jobs = new Map(); // id -> {at, fn, interval}

export const system = {
  get currentTick() {
    return currentTick;
  },
  run(fn) {
    return this.runTimeout(fn, 0);
  },
  runTimeout(fn, ticks = 0) {
    const id = nextId++;
    jobs.set(id, { at: currentTick + Math.max(1, ticks), fn, interval: 0 });
    return id;
  },
  runInterval(fn, ticks = 1) {
    const id = nextId++;
    jobs.set(id, { at: currentTick + Math.max(1, ticks), fn, interval: Math.max(1, ticks) });
    return id;
  },
  clearRun(id) {
    jobs.delete(id);
  },
  afterEvents: { scriptEventReceive: new Signal() },
  beforeEvents: { shutdown: new Signal(true), startup: new Signal() },
};

// ---- テスト用操作 ----
export const __test = {
  worldProps,
  players,
  jobs,
  get readOnly() {
    return readOnly;
  },
  /** 1tick ずつ進め、各tickの後に Promise を解決させる */
  async tick(n = 1) {
    for (let i = 0; i < n; i++) {
      currentTick++;
      for (const [id, j] of [...jobs]) {
        if (j.at <= currentTick) {
          if (j.interval) j.at = currentTick + j.interval;
          else jobs.delete(id);
          j.fn();
        }
      }
      await new Promise((r) => setImmediate(r));
    }
  },
  addPlayer(id, name, props) {
    const p = new Player(id, name, props);
    players.push(p);
    return p;
  },
  mobs,
  /** モンスター等を作る（location を渡すとスキルの範囲判定の対象になる） */
  spawnMob(typeId, families = ["monster", "mob"], location) {
    const e = new Entity(typeId, families);
    if (location) {
      e.location = { ...location };
      mobs.push(e);
    }
    return e;
  },
  /** プレイヤーがモンスターを攻撃して倒すまでの一連のイベント */
  hit(player, mob) {
    world.afterEvents.entityHitEntity.fire({ damagingEntity: player, hitEntity: mob });
  },
  kill(player, mob) {
    mob.isValid = false;
    world.afterEvents.entityDie.fire({ deadEntity: mob, damageSource: { cause: "entityAttack", damagingEntity: player } });
  },
  /** モンスターからプレイヤーへのダメージ（体力を減らし、hurt を発火） */
  hurt(player, mob, damage) {
    player.health.setCurrentValue(player.health.currentValue - damage);
    world.afterEvents.entityHurt.fire({ hurtEntity: player, damage, damageSource: { cause: "entityAttack", damagingEntity: mob } });
  },
  removePlayer(p) {
    p.isValid = false;
    players.splice(players.indexOf(p), 1);
    world.afterEvents.playerLeave.fire({ playerId: p.id, playerName: p.name });
  },
  shutdown() {
    // 実機ではシャットダウン時の書き込み可否が不明のため、ここでは書き込み可能として扱う
    for (const h of system.beforeEvents.shutdown.handlers) h({});
  },
};
