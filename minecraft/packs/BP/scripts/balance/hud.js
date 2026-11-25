// 【設定ファイル】HUD（アクションバー表示）
export const HUD = Object.freeze({
  /** 更新確認の間隔（tick）。表示内容が変わったときだけ再表示する */
  checkIntervalTicks: 10,
  /** 変化がなくても再表示する間隔（tick）。アクションバーは数秒で消えるため */
  refreshIntervalTicks: 40,
  /** ほかのメッセージをアクションバーに出したあと、HUD を出さない時間（tick） */
  yieldTicks: 60,
});
