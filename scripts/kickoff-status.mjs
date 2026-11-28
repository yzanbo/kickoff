// 製品版・開発版の Kickoff で実行中のチャットの数（/api/status の agents.running。子チャットも入る）。
// 金庫を開ける前と製品版を終了する前に、AI が動いていないことを確かめる（npm run install-app・npm run publish が使う）
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** 確かめる Kickoff（保存先とポートは src/foundation/core/system/appEnv.ts と同じ） */
export const KICKOFF_APPS = [
  { label: "製品版", dir: path.join(os.homedir(), "Library", "Application Support", "Kickoff"), port: 4317 },
  { label: "開発版", dir: path.join(os.homedir(), "Library", "Application Support", "Kickoff Dev"), port: 4318 },
];

/**
 * その Kickoff で実行中のチャットの数。動いていない（つながらない・token がない）ときは 0。
 * 動いているのに答えが読めないときは、数えられないので null
 */
export async function runningChatsOf(app) {
  let token;
  try {
    token = readFileSync(path.join(app.dir, "token"), "utf8").trim();
  } catch {
    return 0;
  }
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${app.port}/api/status`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
  } catch {
    return 0;
  }
  try {
    const running = (await res.json())?.agents?.running;
    return Number.isInteger(running) ? running : null;
  } catch {
    return null;
  }
}

/** 実行中のチャットがあれば止める理由の文（なければ null） */
export function busyMessage(results) {
  const busy = results.filter((r) => r.running !== 0);
  if (busy.length === 0) return null;
  const parts = busy.map((r) => (r.running === null ? `${r.label}（数えられません）` : `${r.label}（${r.running} 件）`));
  return `実行中のチャットがあります: ${parts.join("・")}。終わってからもう一度実行してください`;
}

/** 製品版と開発版に実行中のチャットがないことを確かめる（あれば終了コード 1 で止める） */
export async function assertNoRunningChats(apps = KICKOFF_APPS) {
  const results = await Promise.all(apps.map(async (app) => ({ label: app.label, running: await runningChatsOf(app) })));
  const message = busyMessage(results);
  if (message) {
    console.error(message);
    process.exit(1);
  }
}
