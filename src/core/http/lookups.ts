// URL の :id が指すもの（プロジェクト・チャット・グループ・定型文）を DB から引き当てる。ルートでは app.get(path, withProject, handler) のようにミドルウェアとして置き、
// ハンドラーは c.var.project などで受け取る（番号でなければ 400、なければ 404。ルートごとに引き当てと検証を書かない）
import { createMiddleware } from "hono/factory";
import type { Store } from "../db/store.js";
import type { Chat, ChatGroup, Project, Snippet } from "@shared/types";
import { runAsGitHubAccount } from "../git/githubAccount.js";
import { Invalid, NotFound } from "./errors.js";
import { idParam, queryOf } from "./input.js";
import { requireWorktree } from "./workdir.js";

export function requireProject(store: Store, id: number): Project {
  const project = store.projects.get(id);
  if (!project) throw new NotFound("プロジェクトが見つかりません");
  return project;
}

function requireChat(store: Store, id: number): Chat {
  const chat = store.chats.get(id);
  if (!chat) throw new NotFound("チャットが見つかりません");
  return chat;
}

function requireGroup(store: Store, id: number): ChatGroup {
  const group = store.groups.get(id);
  if (!group) throw new NotFound("グループが見つかりません");
  return group;
}

function requireSnippet(store: Store, id: number): Snippet {
  const snippet = store.snippets.get(id);
  if (!snippet) throw new NotFound("定型文が見つかりません");
  return snippet;
}

/** グループ。ほかのプロジェクトのものなら 400（チャットを入れられるのは同じプロジェクトのグループだけ） */
export function requireGroupOf(store: Store, groupId: number, projectId: number): ChatGroup {
  const group = requireGroup(store, groupId);
  if (group.project_id !== projectId) throw new Invalid("ほかのプロジェクトのグループには入れられません");
  return group;
}

/**
 * :id のプロジェクト・チャット・グループ・定型文を c.var に入れるミドルウェア。
 * プロジェクトの操作の中の gh・git は、そのプロジェクトで選んだ GitHub のアカウントで動かす（runAsGitHubAccount）
 */
export function lookups(store: Store) {
  return {
    withProject: createMiddleware<{ Variables: { project: Project } }>(async (c, next) => {
      const project = requireProject(store, idParam(c));
      c.set("project", project);
      await runAsGitHubAccount(project.github_account, next);
    }),
    /**
     * withProject に加えて、操作するフォルダ（?worktree= があればそのワークツリー、なければ本体）を c.var.workdir に入れる
     * （Git・ファイル・検索・/ のコマンド。エディタタブで作業場所を切り替えたとき）
     */
    withWorkdir: createMiddleware<{ Variables: { project: Project; workdir: string } }>(async (c, next) => {
      const project = requireProject(store, idParam(c));
      c.set("project", project);
      c.set("workdir", (await requireWorktree(project.repo_path, queryOf(c, "worktree")))?.path ?? project.repo_path);
      await runAsGitHubAccount(project.github_account, next);
    }),
    withChat: createMiddleware<{ Variables: { chat: Chat } }>(async (c, next) => {
      c.set("chat", requireChat(store, idParam(c)));
      await next();
    }),
    withGroup: createMiddleware<{ Variables: { group: ChatGroup } }>(async (c, next) => {
      c.set("group", requireGroup(store, idParam(c)));
      await next();
    }),
    withSnippet: createMiddleware<{ Variables: { snippet: Snippet } }>(async (c, next) => {
      c.set("snippet", requireSnippet(store, idParam(c)));
      await next();
    }),
  };
}
