// コミット時のフック（.githooks/pre-commit から呼ぶ。メモの方針「0022_テストを軽くする」の ②）。
// コミットするファイルについて、型・使っていない export（knip）・テストの書き方の見張り・関係するテスト（ファイルごとに新しいプロセス）を順に流し、
// 1 つでも落ちたらコミットを止める。確かめるのは作業場所のファイルなので、コミットしない変更が混ざっていたら、流す前に止めて知らせる
import { existsSync } from "node:fs";
import { git, isCodeFile, splitNul, step } from "./common.mjs";

const staged = splitNul(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]));
if (!staged.some(isCodeFile)) process.exit(0);

// 追跡しているファイルの、まだステージしていない変更（作業場所で確かめると、コミットしない中身で通ってしまう）
const unstaged = splitNul(git(["diff", "--name-only", "-z"]));
if (unstaged.length > 0) {
  console.error(
    [
      "コミットしない変更が混ざっているので、確かめずに止めました（確かめるのは作業場所のファイルなので、コミットしない中身で通ってしまうため）。",
      ...unstaged.map((f) => `  ${f}`),
      "コミットする中身だけにしてから（git add で入れる・別のコミットにする・WIP のコミットで退ける）、もう一度コミットしてください。",
    ].join("\n"),
  );
  process.exit(1);
}

const checks = [
  ["型", "npm", ["run", "typecheck", "--silent"]],
  ["使っていない export・ファイル・依存（knip）", "npm", ["run", "knip", "--silent"]],
  ["テストの書き方", "node", ["scripts/check-test-rules.mjs", ...staged]],
  // スマホのアプリは、依存を入れてあるときだけ（入れていない作業場所でも、ほかのコミットを止めない）
  ...(staged.some((f) => f.startsWith("mobile/")) && existsSync("mobile/node_modules") ? [["スマホのアプリの型", "npm", ["run", "mobile:typecheck", "--silent"]]] : []),
  ["関係するテスト（ファイルごと）", "npm", ["run", "test:changed:isolated", "--silent", "--", ...staged]],
];

for (const [label, command, args] of checks) {
  if (!step(label, command, args)) {
    console.error("\nコミットを止めました。直してから、もう一度コミットしてください（フックを飛ばす書き方は使わない）。");
    process.exit(1);
  }
}
