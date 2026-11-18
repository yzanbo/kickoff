// コミット時のフック（.githooks/pre-commit から呼ぶ）。
// 文書の検査をどのコミットでも流し、コードを含むときは構造の検査・型・使っていない export（knip）・テストの書き方の見張り・関係するテスト（ファイルごとに新しいプロセス）を順に流す。
// 1 つでも落ちたらコミットを止める。確かめるのは作業場所のファイルなので、コミットしない変更が混ざっていたら、流す前に止めて知らせる
import { existsSync } from "node:fs";
import { git, preCommitChecks, splitNul, step } from "./common.mjs";

// 消すだけのコミットも、文書の参照が切れることがあるので数える
if (splitNul(git(["diff", "--cached", "--name-only", "-z"])).length === 0) process.exit(0);
const staged = splitNul(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]));

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

for (const [label, command, args] of preCommitChecks(staged, { mobileDeps: existsSync("mobile/node_modules") })) {
  if (!step(label, command, args)) {
    console.error("\nコミットを止めました。直してから、もう一度コミットしてください（フックを飛ばす書き方は使わない）。");
    process.exit(1);
  }
}
