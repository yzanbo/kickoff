// 決まったデータの開発版。データを作るのは npm run fixture:seed（このファイル。砂場の中で流してよい）、起動は npm run dev:fixture
// （package.json の中で electron-vite dev を直接呼ぶ。AI の砂場は Electron を起動するスクリプトだけを砂場の外で流すため）。
// データは /private/tmp/kickoff-fixture（開発版の保存先はその中の data）・コア 4319・CDP 9335 で、利用者の開発版（4318・9333・Kickoff Dev）と同時に動かせる。
// 置き場所は TMPDIR を使わない決まった場所（砂場の中と外で TMPDIR が違いうるため。/private/tmp は砂場の中でも書ける）。
// 止めるときは node scripts/perf/quit-dev.mjs --fixture（CDP の Browser.close）
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** 決まったデータの開発版の場所（package.json の dev:fixture と同じ値。fixture.test.mjs が確かめる） */
export const FIXTURE = {
  /** 決まったデータの置き場所（fixture.json・Git のリポジトリ・メモ・SQLite の DB） */
  root: "/private/tmp/kickoff-fixture",
  /** 開発版の保存先（Kickoff の DB・鍵）。DB のタブは保存先の中のファイルを開かないので、ほかのデータと分ける */
  dataDir: "/private/tmp/kickoff-fixture/data",
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
    return JSON.parse(readFileSync(path.join(FIXTURE.root, "fixture.json"), "utf8"));
  } catch (e) {
    throw new Error(`決まったデータがありません（${FIXTURE.root}）。npm run fixture:seed で作ってから npm run dev:fixture で起動してください（${e.message}）`);
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
    console.error(`決まったデータの開発版がもう動いています（CDP ${FIXTURE.cdp}）。止めてから作り直してください（node scripts/perf/quit-dev.mjs --fixture）`);
    process.exit(1);
  }
  const tsx = path.resolve("node_modules/.bin/tsx");
  const seed = spawnSync(tsx, ["scripts/devtools/seed.ts", "--root", FIXTURE.root, "--data", FIXTURE.dataDir, "--now", String(FIXTURE.now)], { stdio: "inherit" });
  process.exit(seed.status ?? 1);
}
