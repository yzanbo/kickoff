import type { Context, Hono } from "hono";
import { z } from "zod";
import { GITHUB_KINDS, GITHUB_MINE_FILTERS, GITHUB_SORTS, GITHUB_STATE_FILTERS, type GitHubListFilter } from "@shared/types";
import type { ServerDeps } from "../server.js";
import { idParam, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { localOnly } from "../thisMac.js";

/** 一覧の絞り込み（クエリ。label は , 区切り） */
const listQuery = z.object({
  kind: z.enum(GITHUB_KINDS),
  state: z.enum(GITHUB_STATE_FILTERS).default("open"),
  mine: z.enum(GITHUB_MINE_FILTERS).optional(),
  labels: z.string().max(2000).optional(),
  assignee: z.string().max(100).optional(),
  milestone: z.string().max(300).optional(),
  q: z.string().max(500).optional(),
  sort: z.enum(GITHUB_SORTS).default("updated"),
  cursor: z.string().max(500).optional(),
  refresh: z.enum(["1"]).optional(),
});

/** クエリ → 絞り込み（純粋な関数） */
export function filterOfQuery(query: z.infer<typeof listQuery>): GitHubListFilter {
  return {
    kind: query.kind,
    state: query.state,
    mine: query.mine ?? null,
    labels: (query.labels ?? "")
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
    assignee: query.assignee || null,
    milestone: query.milestone || null,
    text: query.q ?? "",
    sort: query.sort,
  };
}

const queriesOf = (c: Context) => Object.fromEntries(["kind", "state", "mine", "labels", "assignee", "milestone", "q", "sort", "cursor", "refresh"].map((k) => [k, queryOf(c, k)]));

/**
 * GitHub タブ（要件 5.11 の段階 1「読む」。core/github/service.ts）: 連携の状態・絞り込みの候補・一覧・issue と PR の中身・PR の変更。
 * この Mac からの頼みだけ受ける（中身は DB に持たず、開くたびに GitHub に聞く。gh はプロジェクトで選んだアカウントで動かす）
 */
export function githubRoutes(app: Hono, { store, github }: ServerDeps) {
  const { withProject } = lookups(store);
  app.use("/api/projects/:id/github/*", localOnly("GitHub タブは、この Mac からだけ使えます"));

  app.get("/api/projects/:id/github/connection", withProject, async (c) => c.json(await github.connection(c.var.project)));
  app.get("/api/projects/:id/github/meta", withProject, async (c) => c.json(await github.meta(c.var.project)));

  app.get("/api/projects/:id/github/items", withProject, async (c) => {
    const query = listQuery.parse(queriesOf(c));
    return c.json(await github.list(c.var.project, filterOfQuery(query), { cursor: query.cursor ?? null, refresh: query.refresh === "1" }));
  });

  app.get("/api/projects/:id/github/issues/:number", withProject, async (c) => c.json(await github.issue(c.var.project, idParam(c, "number"))));
  app.get("/api/projects/:id/github/pulls/:number", withProject, async (c) => c.json(await github.pull(c.var.project, idParam(c, "number"))));
  app.get("/api/projects/:id/github/pulls/:number/files", withProject, async (c) => c.json(await github.pullFiles(c.var.project, idParam(c, "number"))));
}
