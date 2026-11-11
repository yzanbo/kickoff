// Git で管理していないフォルダのファイルの一覧と検索。
// .gitignore（とユーザーの全体の除外の設定）の読み方を Git のものとそろえるため、Git で管理しているフォルダと同じ git のコマンドを使う
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gitOutput } from "./exec.js";

/**
 * Git で管理していないフォルダでも、いつも除いて扱うもの（.gitignore がないことが多いので、
 * 中身の多い依存のフォルダと Finder の印を、無視しているものとして扱う）
 */
export const PLAIN_EXCLUDES = ["node_modules/", ".DS_Store"];

/** 空の git の保存場所（一覧を取るときだけ使う。フォルダの中には何も作らない）。プロセスで 1 つ作って使い回す */
let emptyGitDir: Promise<string> | null = null;
function emptyRepo(): Promise<string> {
  emptyGitDir ??= (async () => {
    const dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "kickoff-plain-")), "empty.git");
    await gitOutput(os.tmpdir(), ["init", "--quiet", "--bare", dir]);
    return dir;
  })().catch((e: unknown) => {
    emptyGitDir = null;
    throw e;
  });
  return emptyGitDir;
}

/**
 * Git で管理していないフォルダで、ls-files を動かす（中身が空の git の保存場所と、このフォルダを作業ツリーにして。
 * どのファイルも「まだ追加していない」扱いになるので、--others と --ignored で一覧と無視しているものが取れる）
 */
export async function plainLsFiles(folder: string, args: string[]): Promise<string> {
  const gitDir = await emptyRepo();
  return gitOutput(folder, [`--git-dir=${gitDir}`, `--work-tree=${folder}`, "ls-files", ...args, ...PLAIN_EXCLUDES.map((p) => `--exclude=${p}`)]);
}

/** Git で管理していないフォルダの検索で、無視しているものを除くときに足す pathspec（--no-index は .gitignore を --exclude-standard で読む） */
export const plainSearchExcludes = () => PLAIN_EXCLUDES.map((p) => (p.endsWith("/") ? `:(glob,exclude)**/${p}**` : `:(glob,exclude)**/${p}`));
