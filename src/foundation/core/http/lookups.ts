// URL の :id が指すもの（プロジェクト・チャット・グループ）を DB から引き当てる。ルートでは app.get(path, withProject, handler) のようにミドルウェアとして置き、
// ハンドラーは c.var.project などで受け取る（番号でなければ 400、なければ 404。ルートごとに引き当てと検証を書かない）
import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { Store } from "@/foundation/core/db/store";
import type { Chat, ChatGroup, Project } from "@shared/types";
import { NotFound } from "@/foundation/core/errors";
import type { ProjectScopes } from "@/foundation/core/workplace/kit";
import { idParam, queryOf } from "./input";
import { requireWorktree } from "./workdir";

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

const SCOPES_KEY = "projectScopes";

/** プロジェクトの頼みの包み（Kernel.workplace.projectScopes）を頼みに持たせる（http/app.ts が認証のあとに置く） */
export function provideProjectScopes(scopes: ProjectScopes): MiddlewareHandler {
  return (c, next) => {
    c.set(SCOPES_KEY as never, scopes as never);
    return next();
  };
}

/** プロジェクトの操作を、登録された包み（github が登録した GitHub のアカウント）の中で流す */
function inProjectScopes(c: Context, project: Project, next: () => Promise<void>): Promise<void> {
  const scopes = c.get(SCOPES_KEY as never) as ProjectScopes | undefined;
  if (!scopes) throw new Error("プロジェクトの包みがありません（http/app.ts の provideProjectScopes を通っていない）");
  return scopes.run(project, next);
}

/**
 * :id のプロジェクト・チャット・グループを c.var に入れるミドルウェア。
 * プロジェクトの操作の中の gh・git は、登録された包みの中で動かす（そのプロジェクトで選んだ GitHub のアカウント）
 */
export function lookups(store: Store) {
  return {
    withProject: createMiddleware<{ Variables: { project: Project } }>(async (c, next) => {
      const project = requireProject(store, idParam(c));
      c.set("project", project);
      await inProjectScopes(c, project, next);
    }),
    /**
     * withProject に加えて、操作するフォルダ（?worktree= があればそのワークツリー、なければ本体）を c.var.workdir に入れる
     * （Git・ファイル・検索・/ のコマンド。エディタタブで作業場所を切り替えたとき）
     */
    withWorkdir: createMiddleware<{ Variables: { project: Project; workdir: string } }>(async (c, next) => {
      const project = requireProject(store, idParam(c));
      c.set("project", project);
      c.set("workdir", (await requireWorktree(project.repo_path, queryOf(c, "worktree")))?.path ?? project.repo_path);
      await inProjectScopes(c, project, next);
    }),
    withChat: createMiddleware<{ Variables: { chat: Chat } }>(async (c, next) => {
      c.set("chat", requireChat(store, idParam(c)));
      await next();
    }),
    withGroup: createMiddleware<{ Variables: { group: ChatGroup } }>(async (c, next) => {
      c.set("group", requireGroup(store, idParam(c)));
      await next();
    }),
  };
}
