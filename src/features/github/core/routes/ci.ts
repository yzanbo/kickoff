import type { Hono } from "hono";
import { z } from "zod";
import type { CiRerunBody } from "@shared/github/ciTypes";
import type { Store } from "@/foundation/core/db/store";
import type { CiService } from "@/features/github/core/ci";
import { idParam, jsonBody } from "@/foundation/core/http/input";
import { lookups } from "@/foundation/core/http/lookups";

const rerunBody = z.object({ failed: z.boolean() }) satisfies z.ZodType<CiRerunBody>;

/**
 * CI の結果（core/github/ci.ts）: 実行の一覧（外の CI の成否も）・実行の中身・ジョブのログ・失敗したステップのログ・
 * やり直し・「（ブランチ名）で直す」の作業場所。GitHub タブと同じく、この Mac からの頼みだけ受ける（gh はプロジェクトで選んだアカウントで動かす）
 */
export function ciRoutes(app: Hono, { store, ci }: { store: Pick<Store, "projects" | "chats" | "groups">; ci: CiService }) {
  const { withProject } = lookups(store);

  app.get("/api/projects/:id/ci/runs", withProject, async (c) => c.json(await ci.list(c.var.project)));
  app.get("/api/projects/:id/ci/runs/:run", withProject, async (c) => c.json(await ci.detail(c.var.project, idParam(c, "run"))));
  app.get("/api/projects/:id/ci/runs/:run/jobs/:job/log", withProject, async (c) => c.json(await ci.jobLog(c.var.project, idParam(c, "run"), idParam(c, "job"))));
  app.get("/api/projects/:id/ci/runs/:run/failed-log", withProject, async (c) => c.json(await ci.failedLog(c.var.project, idParam(c, "run"))));
  // やり直し（様子が変わるだけなので 204。画面が一覧と中身を取り直す）
  app.post("/api/projects/:id/ci/runs/:run/rerun", withProject, async (c) => {
    await ci.rerun(c.var.project, idParam(c, "run"), rerunBody.parse(await jsonBody(c)).failed);
    return c.body(null, 204);
  });
  // 「（ブランチ名）で直す」: そのブランチの作業場所（既定のブランチなら本体。なければワークツリーを作る）
  app.post("/api/projects/:id/ci/runs/:run/worktree", withProject, async (c) => c.json(await ci.worktree(c.var.project, idParam(c, "run"))));
}
