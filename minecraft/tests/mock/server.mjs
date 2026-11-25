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
export const EntityComponentTypes = { Inventory: "minecraft:inventory" };
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

export class Entity {}

export class Player extends Entity {
  constructor(id, name, props = {}) {
    super();
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
    const self = this;
    this.onScreenDisplay = {
      setActionBar(t) {
        assertWritable("setActionBar");
        self.actionBar.push(t);
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
    return id === EntityComponentTypes.Inventory ? { container: this.inventory } : undefined;
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
