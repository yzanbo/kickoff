import type { Context } from "hono";
import { errorMessage } from "../errors.js";
import { gitStatus, listWorktrees } from "../git.js";
import type { Store } from "../store.js";
import type { GitWorktree, Project } from "../types.js";

/** 画面に返すエラー（状態コードと文言） */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

// URL の id からプロジェクト・グループ・チャットを取り出す（見つからなければ 404）

export function requireProject(store: Store, idParam: string) {
  const project = store.getProject(Number(idParam));
  if (!project) throw new HttpError(404, "プロジェクトが見つかりません");
  return project;
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

/** グループ。ほかのプロジェクトのものなら 400（チャットを入れられるのは同じプロジェクトのグループだけ） */
export function requireGroupOf(store: Store, groupId: number, projectId: number) {
  const group = requireGroup(store, String(groupId));
  if (group.project_id !== projectId) throw new HttpError(400, "ほかのプロジェクトのグループには入れられません");
  return group;
}

/**
 * 作業場所の指定（ワークツリーのフォルダ）を、このプロジェクトのワークツリーとして解決する。指定がなければ null（本体）。
 * このプロジェクトのワークツリーでなければ 400、フォルダが消えていれば（アプリの外で消された）404
 */
export async function requireWorktree(repo: string, worktree: string | undefined): Promise<GitWorktree | null> {
  if (!worktree) return null;
  const found = (await listWorktrees(repo)).find((w) => w.path === worktree);
  if (!found) throw new HttpError(400, "このプロジェクトのワークツリーではありません");
  if (found.prunable) throw new HttpError(404, "作業場所のフォルダが見つかりません（ワークツリーが消された可能性があります）");
  return found;
}

/** 操作するフォルダ（?worktree= があればそのワークツリー、なければ本体）。エディタタブで作業場所を切り替えたときに使う */
export async function requireWorkdir(c: Context, project: Project): Promise<string> {
  return (await requireWorktree(project.repo_path, c.req.query("worktree")))?.path ?? project.repo_path;
}

type ErrorClass = abstract new (...args: never[]) => Error;

async function rethrowAs<T>(fn: () => Promise<T>, statusOf: (e: unknown) => 400 | 409): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new HttpError(statusOf(e), errorMessage(e));
  }
}

/** 操作の失敗（例外の文）を 400 で画面に返す。conflict に当たる例外は 409（ファイルの保存で、開いたあとに変わっていたとき） */
export const badRequest = <T>(fn: () => Promise<T>, conflict?: ErrorClass): Promise<T> =>
  rethrowAs(fn, (e) => (conflict && e instanceof conflict ? 409 : 400));

/** いまはできない操作（エージェントが作業中など）の失敗を 409 で返す */
export const conflictOnError = <T>(fn: () => Promise<T>): Promise<T> => rethrowAs(fn, () => 409);

/** Git の操作をしてから、新しい状態を返す（失敗は 400） */
export async function gitAction(c: Context, dir: string, action: () => Promise<void>) {
  await badRequest(action);
  return c.json(await gitStatus(dir));
}
