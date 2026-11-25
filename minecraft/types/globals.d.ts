// Minecraft のスクリプト実行環境で利用できるグローバル（型チェック用）
declare const console: {
  log(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};
