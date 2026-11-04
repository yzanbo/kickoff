// テスト用の Git の作業場所。テストからだけ使う
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "./tempDir.js";

// テストで動かす git（準備も、コアの処理のコミットも）の名前。Git の名前を設定していない環境でもコミットできるよう、
// この補助を読み込んだテストでは環境変数で渡す（すでに決めてあればそのまま）
const IDENTITY = { GIT_AUTHOR_NAME: "Kickoff Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Kickoff Test", GIT_COMMITTER_EMAIL: "test@example.com" };
for (const [key, value] of Object.entries(IDENTITY)) process.env[key] ??= value;

/** その作業場所で git を動かし、標準出力を返す */
export const gitIn =
  (dir: string) =>
  (...args: string[]): string =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });

/**
 * Git の作業場所を用意する（main ブランチ）。dir を省くと一時フォルダに作る。
 * files（パス → 中身）を渡すと書いて、最初のコミット（init）を作る。git で、その作業場所で git を動かす
 */
export function gitRepo({ dir = tempDir(), files }: { dir?: string; files?: Record<string, string> } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const git = gitIn(dir);
  git("init", "-q", "-b", "main");
  if (files) {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    git("add", "-A");
    git("commit", "-q", "-m", "init");
  }
  return { dir, git };
}
