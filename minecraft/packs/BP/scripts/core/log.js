// ログ出力。console.warn / console.error はコンテンツログに出力される。
// 例外を投げないこと（ログ処理で落ちるとゲーム全体に影響するため）。

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
let currentLevel = LEVELS.info;

/** 直近のエラー（診断画面で表示する） */
const recentErrors = [];
const MAX_RECENT = 20;

/** エラー発生時に呼ばれる通知先（管理者へのチャット通知など） */
let errorListener = null;

export function setLogLevel(name) {
  if (LEVELS[name] !== undefined) currentLevel = LEVELS[name];
}

export function setErrorListener(fn) {
  errorListener = typeof fn === "function" ? fn : null;
}

export function getRecentErrors() {
  return recentErrors.slice();
}

function stringify(parts) {
  return parts
    .map((p) => {
      if (p instanceof Error) return `${p.name}: ${p.message}${p.stack ? "\n" + p.stack : ""}`;
      if (typeof p === "object") {
        try {
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      }
      return String(p);
    })
    .join(" ");
}

function out(level, tag, parts) {
  try {
    if (LEVELS[level] < currentLevel) return;
    const text = `[魔神野口][${level.toUpperCase()}][${tag}] ${stringify(parts)}`;
    if (level === "error") {
      console.error(text);
      recentErrors.push({ at: Date.now(), text: text.slice(0, 300) });
      if (recentErrors.length > MAX_RECENT) recentErrors.shift();
      if (errorListener) {
        try {
          errorListener(text);
        } catch {
          // 通知の失敗は無視する
        }
      }
    } else if (level === "warn") {
      console.warn(text);
    } else {
      // console.log はサーバーでは表示されないことがあるため warn を使わない範囲で出す
      console.log(text);
    }
  } catch {
    // ログ処理で例外が起きても無視する
  }
}

/** タグ付きロガーを作成する */
export function createLogger(tag) {
  return {
    debug: (...p) => out("debug", tag, p),
    info: (...p) => out("info", tag, p),
    warn: (...p) => out("warn", tag, p),
    error: (...p) => out("error", tag, p),
  };
}
