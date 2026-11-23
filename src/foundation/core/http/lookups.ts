// URL の :id が指すもの（プロジェクト・チャット・グループ）を DB から引き当てる。ルートでは app.get(path, withProject, handler) のようにミドルウェアとして置き、
// ハンドラーは c.var.project などで受け取る（番号でなければ 400、なければ 404。ルートごとに引き当てと検証を書かない）
import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { NotFound } from "@/foundation/core/errors";
import type { ProjectScopes, ScopedProject } from "@/foundation/core/workplace/kit";
import { resolveWorkdir } from "@/foundation/core/workplace/worktrees";
import { idParam, queryOf } from "./input";

/** 番号で引く店（なければ undefined）。プロジェクト・チャット・グループの店は機能の持ち物なので、形だけで受ける */
interface Finder<T> {
  get(id: number): T | undefined;
}

/** 引き当てるプロジェクト（使う欄だけ） */
type LookupProject = ScopedProject & { repo_path: string };

const found = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new NotFound(`${what}が見つかりません`);
  return value;
};

/** 引き当てに使う店（ルートに渡していなければ組み立ての誤り） */
const need = <T>(finder: Finder<T> | undefined, what: string): Finder<T> => {
  if (!finder) throw new Error(`${what}の店を lookups に渡していません`);
  return finder;
};

export function requireProject<P>(store: { projects: Finder<P> }, id: number): P {
  return found(store.projects.get(id), "プロジェクト");
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
function inProjectScopes(c: Context, project: ScopedProject, next: () => Promise<void>): Promise<void> {
  const scopes = c.get(SCOPES_KEY as never) as ProjectScopes | undefined;
  if (!scopes) throw new Error("プロジェクトの包みがありません（http/app.ts の provideProjectScopes を通っていない）");
  return scopes.run(project, next);
}

/**
 * :id のプロジェクト・チャット・グループを c.var に入れるミドルウェア（チャット・グループの店は、それを引くルートだけが渡す）。
 * プロジェクトの操作の中の gh・git は、登録された包みの中で動かす（そのプロジェクトで選んだ GitHub のアカウント）
 */
export function lookups<P extends LookupProject, C = never, G = never>(store: { projects: Finder<P>; chats?: Finder<C>; groups?: Finder<G> }) {
  return {
    withProject: createMiddleware<{ Variables: { project: P } }>(async (c, next) => {
      const project = requireProject(store, idParam(c));
      c.set("project", project);
      await inProjectScopes(c, project, next);
    }),
    /**
     * withProject に加えて、操作するフォルダ（?worktree= があればそのワークツリー、なければ本体）を c.var.workdir に入れる
     * （Git・ファイル・検索・/ のコマンド。エディタタブで作業場所を切り替えたとき）
     */
    withWorkdir: createMiddleware<{ Variables: { project: P; workdir: string } }>(async (c, next) => {
      const project = requireProject(store, idParam(c));
      c.set("project", project);
      c.set("workdir", await resolveWorkdir(project.repo_path, queryOf(c, "worktree")));
      await inProjectScopes(c, project, next);
    }),
    withChat: createMiddleware<{ Variables: { chat: C } }>(async (c, next) => {
      c.set("chat", found(need(store.chats, "チャット").get(idParam(c)), "チャット"));
      await next();
    }),
    withGroup: createMiddleware<{ Variables: { group: G } }>(async (c, next) => {
      c.set("group", found(need(store.groups, "グループ").get(idParam(c)), "グループ"));
      await next();
    }),
  };
}
