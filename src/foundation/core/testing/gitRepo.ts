// テスト用の Git の作業場所。テストからだけ使う
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "./tempDir";

// テストで動かす git（準備も、コアの処理のコミットも）の名前。Git の名前を設定していない環境でもコミットできるよう、
// この補助を読み込んだテストでは環境変数で渡す（すでに決めてあればそのまま）
const IDENTITY = { GIT_AUTHOR_NAME: "Kickoff Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Kickoff Test", GIT_COMMITTER_EMAIL: "test@example.com" };
// test-rules-ignore: 読み込んだときに、テストの git が使う名前を入れる（利用者が決めた値は ??= で上書きしない）
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

/** 裸のリモート（src を渡せば、その作業場所を写したもの。省けば main の空のもの）のフォルダ */
export function bareRemote(src?: string): string {
  const dir = path.join(tempDir(), "origin.git");
  if (src) execFileSync("git", ["clone", "-q", "--bare", src, dir]);
  else execFileSync("git", ["init", "-q", "--bare", "-b", "main", dir]);
  return dir;
}

/** remote を写した作業場所（dir を省くと一時フォルダ）。git で、その作業場所で git を動かす */
export function cloneOf(remote: string, dir = tempDir()) {
  execFileSync("git", ["clone", "-q", remote, dir]);
  return { dir, git: gitIn(dir) };
}

/** ファイルを書き、すべてステージしてコミットする */
export function commitFile(dir: string, file: string, content: string, message: string) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
  const git = gitIn(dir);
  git("add", "-A");
  git("commit", "-q", "-m", message);
}
