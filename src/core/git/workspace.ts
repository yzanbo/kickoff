import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@shared/errors";
import { gitOutput } from "./exec.js";
import { hasRef } from "./status.js";
import { expandHome } from "../system/paths.js";
import type { FolderInspection } from "@shared/types";
import { Conflict, Invalid } from "../http/errors.js";

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
  /** プロジェクトの説明（README の「アイデア」に書く） */
  description: string;
  /** git リポジトリとして初期化するか（省くと初期化する。しなければ README だけを置く） */
  initGit?: boolean;
}

/**
 * 新規プロジェクトのフォルダを作り、README を置く。initGit なら git リポジトリとして初期化する
 * （worktree を作るには main にコミットが 1 つ以上必要なので、README で最初のコミットまで行う）。
 * git で管理しないプロジェクトでは、ワークツリー・変更・履歴は使えない（あとから initGitRepo で始められる）
 */
export async function createWorkspace(input: NewWorkspace): Promise<string> {
  const folder = toFolderName(input.folderName);
  if (!folder) throw new Invalid("フォルダ名には英数字・ハイフン・アンダースコアを使ってください");
  const parent = path.resolve(expandHome(input.parentDir.trim()));
  const stat = await fs.stat(parent).catch(() => null);
  if (!stat?.isDirectory()) throw new Invalid(`保存先のフォルダが見つかりません: ${parent}`);

  const repo = path.join(parent, folder);
  const existing = await fs.readdir(repo).catch(() => null);
  if (existing && existing.length > 0) throw new Conflict(`同じ名前のフォルダがすでにあり、空ではありません: ${repo}`);

  await fs.mkdir(repo, { recursive: true });
  const idea = input.description.trim();
  const readme = `# ${input.name.trim()}\n\n${idea ? `## アイデア\n\n${idea}\n` : ""}`;
  if (input.initGit === false) {
    await fs.writeFile(path.join(repo, "README.md"), readme, "utf8");
    return fs.realpath(repo);
  }
  try {
    await git(repo, ["init", "-b", "main"]);
    await fs.writeFile(path.join(repo, "README.md"), readme, "utf8");
    await git(repo, ["add", "README.md"]);
    await git(repo, ["commit", "-m", "chore: Kickoff でプロジェクトを作成"]);
  } catch (e) {
    // 途中で失敗したら、作ったフォルダを片付けてから伝える
    if (!existing) await fs.rm(repo, { recursive: true, force: true });
    const detail = errorMessage(e);
    throw new Invalid(`git リポジトリの初期化に失敗しました: ${detail}`);
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
  result.has_commits = await hasRef(target, "HEAD");
  result.branch = (await git(target, ["branch", "--show-current"]).catch(() => "")) || null;
  result.remote_url = (await git(target, ["remote", "get-url", "origin"]).catch(() => "")) || null;
  result.dirty = Boolean(await git(target, ["status", "--porcelain"]).catch(() => ""));
  return result;
}

/**
 * 既存のフォルダを取り込めるようにする（プロジェクトのフォルダを変えるときも同じ）。git のリポジトリの一部（サブフォルダ）は断る。
 * git 未管理・コミットなしのフォルダは、initGit（ユーザーの同意）があれば初期化して最初のコミットを作り、なければそのまま使う
 * （git で管理しないプロジェクト。ワークツリー・変更・履歴は使えず、あとから initGitRepo で始められる）
 */
export async function prepareImportedWorkspace(rawPath: string, initGit: boolean): Promise<string> {
  const info = await inspectWorkspace(rawPath);
  if (!info.exists || !info.is_directory) throw new Invalid(`フォルダが見つかりません: ${info.path}`);
  const real = info.path;
  if (info.is_git && info.git_root !== real) {
    throw new Invalid(`このフォルダは git リポジトリの一部です。ルートのフォルダを指定してください: ${info.git_root}`);
  }
  if (initGit && !(info.is_git && info.has_commits)) await initGitRepo(real, "chore: Kickoff に取り込み");
  return real;
}

/**
 * フォルダで git の管理を始める（git でなければ main で初期化し、いまあるファイルで最初のコミットを作る。コミットがなければコミットだけ）。
 * もうコミットのあるリポジトリ・ほかのリポジトリの中のフォルダは断る（409）
 */
export async function initGitRepo(dir: string, message = "chore: Kickoff で git の管理を開始"): Promise<void> {
  const info = await inspectWorkspace(dir);
  if (!info.exists || !info.is_directory) throw new Invalid(`フォルダが見つかりません: ${info.path}`);
  if (info.is_git && info.git_root !== info.path) throw new Conflict(`このフォルダは git リポジトリ（${info.git_root}）の中にあります`);
  if (info.is_git && info.has_commits) throw new Conflict("このフォルダは、もう git で管理しています");
  try {
    if (!info.is_git) await git(info.path, ["init", "-b", "main"]);
    await git(info.path, ["add", "-A"]);
    await git(info.path, ["commit", "--allow-empty", "-m", message]);
  } catch (e) {
    throw new Invalid(`git の初期化に失敗しました: ${errorMessage(e)}`);
  }
}
