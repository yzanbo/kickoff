// 決まったデータで開発版を起動する（npm run dev:fixture）。保存先 ${TMPDIR}/kickoff-fixture・コア 4319・CDP 9335 で、
// 利用者の開発版（4318・9333・Kickoff Dev）と同時に動かせる。起動のたびにデータを作り直す（scripts/devtools/seed.ts）。
// 止めるときは node scripts/perf/quit-dev.mjs --fixture（CDP の Browser.close）か、この起動に SIGINT・SIGTERM を送る（開発版へ渡す）
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const FIXTURE = {
  dataDir: path.join(os.tmpdir(), "kickoff-fixture"),
  cdp: 9335,
  api: 4319,
  /** 画面の時計の起点（2026-11-19 12:00 JST）。記録の相対時刻をそろえる */
  now: Date.parse("2026-11-19T12:00:00+09:00"),
};

/** 引数に --fixture があるか（決まったデータの開発版を相手にする） */
export function usesFixture(argv = process.argv) {
  return argv.includes("--fixture");
}

/** 作ったデータの ID（<保存先>/fixture.json） */
export function readFixture() {
  try {
    return JSON.parse(readFileSync(path.join(FIXTURE.dataDir, "fixture.json"), "utf8"));
  } catch (e) {
    throw new Error(`決まったデータがありません（${FIXTURE.dataDir}）。npm run dev:fixture で起動してください（${e.message}）`);
  }
}

/** 測る道具（scripts/perf/）の既定の ID: --fixture なら決まったデータの alpha と長いチャット、なければ利用者の開発版の DB のプロジェクト 21・チャット 224 */
export function perfDefaults(argv = process.argv) {
  if (!usesFixture(argv)) return { project: "21", chat: "224" };
  const fixture = readFixture();
  return { project: String(fixture.projects.alpha), chat: String(fixture.chats.long) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // 動いている開発版の下でデータを消さない
  const running = await fetch(`http://127.0.0.1:${FIXTURE.cdp}/json/version`).then(
    () => true,
    () => false,
  );
  if (running) {
    console.error(`決まったデータの開発版がもう動いています（CDP ${FIXTURE.cdp}）。止めてから起動してください（node scripts/perf/quit-dev.mjs --fixture）`);
    process.exit(1);
  }
  const bin = (name) => path.resolve("node_modules/.bin", name);
  const seed = spawnSync(bin("tsx"), ["scripts/devtools/seed.ts", "--data", FIXTURE.dataDir, "--now", String(FIXTURE.now)], { stdio: "inherit" });
  if (seed.status !== 0) process.exit(seed.status ?? 1);
  const env = { ...process.env, KICKOFF_REMOTE_DEBUG: String(FIXTURE.cdp), KICKOFF_PORT: String(FIXTURE.api), KICKOFF_USER_DATA_DIR: FIXTURE.dataDir };
  const child = spawn(bin("electron-vite"), ["dev"], { stdio: "inherit", env });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
