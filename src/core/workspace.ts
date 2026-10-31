import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 30_000 });
  return stdout.trim();
}

/** "~/foo" をホームディレクトリに展開する */
export function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}

/** フォルダ名として安全な文字だけにする（英数字・ハイフン・アンダースコア・ドット） */
export function toFolderName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

export interface NewWorkspace {
  parentDir: string;
  folderName: string;
  name: string;
  idea: string;
}

/**
 * 新規プロジェクトのフォルダを作り、git リポジトリとして初期化する。
 * worktree を作るには main にコミットが 1 つ以上必要なので、README を置いて最初のコミットまで行う。
 */
export async function createWorkspace(input: NewWorkspace): Promise<string> {
  const folder = toFolderName(input.folderName);
  if (!folder) throw new Error("フォルダ名には英数字・ハイフン・アンダースコアを使ってください");
  const parent = path.resolve(expandHome(input.parentDir.trim()));
  const stat = await fs.stat(parent).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`保存先のフォルダが見つかりません: ${parent}`);

  const repo = path.join(parent, folder);
  const existing = await fs.readdir(repo).catch(() => null);
  if (existing && existing.length > 0) throw new Error(`同じ名前のフォルダがすでにあり、空ではありません: ${repo}`);

  await fs.mkdir(repo, { recursive: true });
  try {
    await git(repo, ["init", "-b", "main"]);
    const readme = `# ${input.name.trim()}\n\n${input.idea.trim() ? `## アイデア\n\n${input.idea.trim()}\n` : ""}`;
    await fs.writeFile(path.join(repo, "README.md"), readme, "utf8");
    await git(repo, ["add", "README.md"]);
    await git(repo, ["commit", "-m", "chore: Kickoff でプロジェクトを作成"]);
  } catch (e) {
    // 途中で失敗したら、作ったフォルダを片付けてから伝える
    if (!existing) await fs.rm(repo, { recursive: true, force: true });
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`git リポジトリの初期化に失敗しました: ${detail}`);
  }
  return repo;
}
