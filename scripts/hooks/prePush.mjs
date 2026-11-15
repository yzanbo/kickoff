// push 時のフック（.githooks/pre-push から呼ぶ。メモの方針「0022_テストを軽くする」の ③）。
// 全体のテストを 1 プロセスで（順番を毎回入れ替えて）流し、ビルドを確かめる。1 つでも落ちたら push を止める。
// ビルドは一時フォルダに出す（動いている開発版が読む out/ を書き換えないように）
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pushesCommits, step } from "./common.mjs";

// 標準入力に送る参照が届く（消すだけの push なら確かめない）
if (!pushesCommits(readFileSync(0, "utf8"))) process.exit(0);

const outDir = mkdtempSync(path.join(os.tmpdir(), "kickoff-prepush-build-"));
try {
  const checks = [
    ["全体のテスト（1 プロセス・順番を入れ替え）", "npm", ["test", "--silent"]],
    ["ビルド", "npx", ["electron-vite", "build", "--outDir", outDir, "--logLevel", "warn"]],
  ];
  for (const [label, command, args] of checks) {
    if (!step(label, command, args)) {
      console.error("\npush を止めました。直してから、もう一度 push してください（フックを飛ばす書き方は使わない）。");
      process.exitCode = 1;
      break;
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
