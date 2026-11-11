import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { NotFound } from "../errors.js";
import { lookups } from "../lookups.js";

/**
 * ワークツリーの PR の知らせ（ワークツリーのブランチの PR が GitHub でマージされた・マージせずに閉じられた。core/git/prWatch.ts）。
 * 一覧・窓に戻ったときの取り直し・確認を閉じた（同じ PR では確認を出し直さない）
 */
export function worktreePrRoutes(app: Hono, { store, prWatch }: ServerDeps) {
  const { withProject } = lookups(store);

  app.get("/api/worktree-prs", (c) => c.json(prWatch.list()));

  // 画面が窓に戻ったとき（30 秒以内の続けての取り直しはまとめる）。取り直したあとの一覧を返す
  app.post("/api/worktree-prs/refresh", async (c) => c.json(await prWatch.refresh()));

  // 確認を閉じた。変わった知らせは SSE で届く
  app.post("/api/projects/:id/worktree-prs/:number/dismiss", withProject, (c) => {
    const number = z.coerce.number().int().positive().parse(c.req.param("number"));
    if (!prWatch.list().some((n) => n.project_id === c.var.project.id && n.pr.number === number)) throw new NotFound("その PR の知らせはありません");
    prWatch.dismiss(c.var.project.id, number);
    return c.body(null, 204);
  });
}
