// 種族の定義
import { Registry } from "./registry.js";

export const DEFAULT_RACE_ID = "human";

export const races = new Registry("種族").registerAll([
  { id: "human", name: "人間", description: "異世界に迷い込んだ、ごく普通の人間。" },
]);
