import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@shared/errors";
import { gitOutput } from "./index.js";
import { expandHome } from "../system/paths.js";
import type { FolderInspection } from "@shared/types";

const git = async (cwd: string, args: string[]) => (await gitOutput(cwd, args)).trim();

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

interface NewWorkspace {
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
    const detail = errorMessage(e);
    throw new Error(`git リポジトリの初期化に失敗しました: ${detail}`);
  }
  // 取り込み時の重複チェックと揃えるため、実体のパスで登録する
  return fs.realpath(repo);
}

export async function inspectWorkspace(rawPath: string): Promise<FolderInspection> {
  const target = path.resolve(expandHome(rawPath.trim()));
  const result: FolderInspection = {
    path: target,
    exists: false,
    is_directory: false,
    is_git: false,
    git_root: null,
    has_commits: false,
    branch: null,
    remote_url: null,
    dirty: false,
    suggested_name: path.basename(target),
  };
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return result;
  result.exists = true;
  result.is_directory = stat.isDirectory();
  if (!result.is_directory) return result;
  // macOS の /tmp → /private/tmp などのシンボリックリンクを解決し、git のルートと比較できるようにする
  result.path = await fs.realpath(target);

  const root = await git(target, ["rev-parse", "--show-toplevel"]).catch(() => null);
  if (!root) return result;
  result.is_git = true;
  result.git_root = await fs.realpath(root).catch(() => root);
  result.has_commits = Boolean(await git(target, ["rev-parse", "--verify", "HEAD"]).catch(() => null));
  result.branch = (await git(target, ["branch", "--show-current"]).catch(() => "")) || null;
  result.remote_url = (await git(target, ["remote", "get-url", "origin"]).catch(() => "")) || null;
  result.dirty = Boolean(await git(target, ["status", "--porcelain"]).catch(() => ""));
  return result;
}

/**
 * 既存のフォルダを取り込めるようにする。
 * worktree を作るにはコミットが必要なため、git 未管理・コミットなしの場合は
 * initGit（ユーザーの同意）があるときだけ初期化して最初のコミットを作る。
 */
export async function prepareImportedWorkspace(rawPath: string, initGit: boolean): Promise<string> {
  const info = await inspectWorkspace(rawPath);
  if (!info.exists || !info.is_directory) throw new Error(`フォルダが見つかりません: ${info.path}`);
  const real = info.path;
  if (info.is_git && info.git_root !== real) {
    throw new Error(`このフォルダは git リポジトリの一部です。ルートのフォルダを指定してください: ${info.git_root}`);
  }
  if (info.is_git && info.has_commits) return real;

  if (!initGit) {
    throw new Error(
      info.is_git
        ? "コミットがまだありません。最初のコミットを作成することに同意してください"
        : "git で管理されていません。git リポジトリとして初期化することに同意してください",
    );
  }
  try {
    if (!info.is_git) await git(real, ["init", "-b", "main"]);
    await git(real, ["add", "-A"]);
    await git(real, ["commit", "--allow-empty", "-m", "chore: Kickoff に取り込み"]);
  } catch (e) {
    throw new Error(`git の初期化に失敗しました: ${errorMessage(e)}`);
  }
  return real;
}
