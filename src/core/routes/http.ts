import { listWorktrees } from "../git.js";
import type { Store } from "../store.js";

/** 画面に返すエラー（状態コードと文言） */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

// URL の id からプロジェクト・タスク・グループ・チャットを取り出す（見つからなければ 404）

export function requireProject(store: Store, idParam: string) {
  const project = store.getProject(Number(idParam));
  if (!project) throw new HttpError(404, "プロジェクトが見つかりません");
  return project;
}

export function requireTask(store: Store, idParam: string) {
  const task = store.getTask(Number(idParam));
  if (!task) throw new HttpError(404, "タスクが見つかりません");
  return task;
}

export function requireGroup(store: Store, idParam: string) {
  const group = store.getGroup(Number(idParam));
  if (!group) throw new HttpError(404, "グループが見つかりません");
  return group;
}

export function requireRun(store: Store, idParam: string) {
  const run = store.getRun(Number(idParam));
  if (!run) throw new HttpError(404, "実行が見つかりません");
  return run;
}

/**
 * 作業場所のフォルダ（?worktree= の値）。なければ本体。このプロジェクトのワークツリーでなければ 400、
 * フォルダが消えていれば（アプリの外で消された）404
 */
export async function requireWorkdir(repo: string, worktree: string | undefined): Promise<string> {
  if (!worktree) return repo;
  const found = (await listWorktrees(repo)).find((w) => w.path === worktree);
  if (!found) throw new HttpError(400, "このプロジェクトのワークツリーではありません");
  if (found.prunable) throw new HttpError(404, "作業場所のフォルダが見つかりません（ワークツリーが消された可能性があります）");
  return found.path;
}
