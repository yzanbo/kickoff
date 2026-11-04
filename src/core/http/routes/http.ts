import type { Context } from "hono";
import { findWorktree } from "../../git/index.js";
import type { Store } from "../../db/store.js";
import type { GitWorktree, Project } from "@shared/types";
import { Invalid, NotFound } from "../errors.js";

// URL の id からプロジェクト・グループ・チャットを取り出す（見つからなければ 404）

export function requireProject(store: Store, idParam: string) {
  const project = store.projects.get(Number(idParam));
  if (!project) throw new NotFound("プロジェクトが見つかりません");
  return project;
}

export function requireGroup(store: Store, idParam: string) {
  const group = store.groups.get(Number(idParam));
  if (!group) throw new NotFound("グループが見つかりません");
  return group;
}

export function requireChat(store: Store, idParam: string) {
  const chat = store.chats.get(Number(idParam));
  if (!chat) throw new NotFound("チャットが見つかりません");
  return chat;
}

/** グループ。ほかのプロジェクトのものなら 400（チャットを入れられるのは同じプロジェクトのグループだけ） */
export function requireGroupOf(store: Store, groupId: number, projectId: number) {
  const group = requireGroup(store, String(groupId));
  if (group.project_id !== projectId) throw new Invalid("ほかのプロジェクトのグループには入れられません");
  return group;
}

/**
 * 作業場所の指定（ワークツリーのフォルダ）を、このプロジェクトのワークツリーとして解決する。指定がなければ null（本体）。
 * このプロジェクトのワークツリーでなければ 400、フォルダが消えていれば（アプリの外で消された）404
 */
export async function requireWorktree(repo: string, worktree: string | undefined): Promise<GitWorktree | null> {
  if (!worktree) return null;
  const found = await findWorktree(repo, worktree);
  if (!found) throw new Invalid("このプロジェクトのワークツリーではありません");
  if (found.prunable) throw new NotFound("作業場所のフォルダが見つかりません（ワークツリーが消された可能性があります）");
  return found;
}

/** 操作するフォルダ（?worktree= があればそのワークツリー、なければ本体）。エディタタブで作業場所を切り替えたときに使う */
export async function requireWorkdir(c: Context, project: Project): Promise<string> {
  return (await requireWorktree(project.repo_path, c.req.query("worktree")))?.path ?? project.repo_path;
}
