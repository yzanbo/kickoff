// git のフック（.githooks/pre-commit・pre-push）で共通に使う補助（メモの方針「0022_テストを軽くする」）
import { spawnSync } from "node:child_process";

/** 型・knip・テストに関係するファイル（これを 1 つもコミットしないなら、コミット時の確かめは流さない） */
const CODE_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs|json)$/;

export function isCodeFile(file) {
  return CODE_FILE.test(file);
}

/**
 * フックの中で流すコマンドに渡す環境変数。git がフックに付ける GIT_*（GIT_INDEX_FILE・GIT_DIR など）を外す。
 * 残すと、テストが一時フォルダに作る Git の作業場所の操作が、このリポジトリの索引（index）を指してしまう
 */
export function commandEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("GIT_")));
}

/**
 * pre-push の標準入力（1 行に「手元の参照 手元のコミット 先の参照 先のコミット」）から、送るコミットがあるか。
 * 消すだけの push（手元のコミットが 0 だけ）なら確かめない
 */
export function pushesCommits(stdin) {
  return stdin
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .some((cols) => cols.length >= 4 && !/^0+$/.test(cols[1]));
}

/** git のコマンドを流して出力を返す（フックの中なので GIT_* はそのまま。コミットしようとしている索引を見るため） */
export function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.trim()}`);
  return r.stdout;
}

/** NUL 区切りのファイルの一覧（git の -z の出力）を配列に */
export function splitNul(text) {
  return text.split("\0").filter(Boolean);
}

/** 確かめの 1 つを流す。通れば true（かかった時間を出す） */
export function step(label, command, args) {
  const started = Date.now();
  console.log(`\n▶ ${label}（${[command, ...args].join(" ")}）`);
  const r = spawnSync(command, args, { stdio: "inherit", env: commandEnv() });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`✓ ${label}（${seconds} 秒）`);
    return true;
  }
  console.error(`✗ ${label} が通りませんでした（${seconds} 秒）`);
  return false;
}
