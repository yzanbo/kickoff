import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  GITHUB_CHECKOUT_PLACES,
  GITHUB_CLOSE_REASONS,
  GITHUB_KINDS,
  GITHUB_MERGE_METHODS,
  GITHUB_MINE_FILTERS,
  GITHUB_REVIEW_EVENTS,
  GITHUB_SORTS,
  GITHUB_STATE_FILTERS,
  type GitHubCheckoutBody,
  type GitHubCommentBody,
  type GitHubLabelsBody,
  type GitHubListFilter,
  type GitHubMergeBody,
  type GitHubNewIssueBody,
  type GitHubReviewBody,
  type GitHubStateBody,
  type GitHubThreadReplyBody,
  type GitHubThreadResolveBody,
} from "@shared/types";
import type { ServerDeps } from "../server.js";
import { idParam, jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";

/** 一覧の絞り込み（クエリ。label・assignees は , 区切り、milestones は改行区切り（名前に , を含みうる）） */
const listQuery = z.object({
  kind: z.enum(GITHUB_KINDS),
  state: z.enum(GITHUB_STATE_FILTERS).default("open"),
  mine: z.enum(GITHUB_MINE_FILTERS).optional(),
  labels: z.string().max(2000).optional(),
  assignees: z.string().max(2000).optional(),
  milestones: z.string().max(3000).optional(),
  q: z.string().max(500).optional(),
  sort: z.enum(GITHUB_SORTS).default("updated"),
  cursor: z.string().max(500).optional(),
  refresh: z.enum(["1"]).optional(),
});

const splitList = (v: string | undefined, sep: string) =>
  (v ?? "")
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

/** クエリ → 絞り込み（純粋な関数） */
export function filterOfQuery(query: z.infer<typeof listQuery>): GitHubListFilter {
  return {
    kind: query.kind,
    state: query.state,
    mine: query.mine ?? null,
    labels: splitList(query.labels, ","),
    assignees: splitList(query.assignees, ","),
    milestones: splitList(query.milestones, "\n"),
    text: query.q ?? "",
    sort: query.sort,
  };
}

/** GitHub に書く Markdown（GitHub の上限は 65,536 文字） */
const markdown = z.string().max(65_536);
const labelName = z.string().trim().min(1).max(100);
const login = z.string().trim().min(1).max(100);

const commentBody = z.object({ body: markdown.refine((b) => b.trim() !== "", "本文を書いてください") }) satisfies z.ZodType<GitHubCommentBody>;
const stateBody = z.object({ state: z.enum(["open", "closed"]), reason: z.enum(GITHUB_CLOSE_REASONS).nullable().default(null) }) satisfies z.ZodType<GitHubStateBody>;
const labelsBody = z.object({ labels: z.array(labelName).max(100) }) satisfies z.ZodType<GitHubLabelsBody>;
const newIssueBody = z.object({
  title: z.string().trim().min(1, "題名を書いてください").max(256),
  body: markdown.default(""),
  labels: z.array(labelName).max(100).default([]),
  assignees: z.array(login).max(10).default([]),
}) satisfies z.ZodType<GitHubNewIssueBody>;
const reviewBody = z.object({
  event: z.enum(GITHUB_REVIEW_EVENTS),
  body: markdown.default(""),
  comments: z
    .array(
      z.object({
        path: z.string().min(1).max(4096),
        line: z.number().int().positive(),
        side: z.enum(["LEFT", "RIGHT"]),
        start_line: z.number().int().positive().nullable().default(null),
        body: markdown.refine((b) => b.trim() !== "", "行のコメントの本文を書いてください"),
      }),
    )
    .max(200)
    .default([]),
  commit_id: z.string().regex(/^[0-9a-f]{7,64}$/).nullable().default(null),
}) satisfies z.ZodType<GitHubReviewBody>;
const replyBody = commentBody satisfies z.ZodType<GitHubThreadReplyBody>;
const resolveBody = z.object({ resolved: z.boolean() }) satisfies z.ZodType<GitHubThreadResolveBody>;
const mergeBody = z.object({ method: z.enum(GITHUB_MERGE_METHODS), sha: z.string().regex(/^[0-9a-f]{7,64}$/).nullable().default(null) }) satisfies z.ZodType<GitHubMergeBody>;
const checkoutBody = z.object({ place: z.enum(GITHUB_CHECKOUT_PLACES) }) satisfies z.ZodType<GitHubCheckoutBody>;
/** GraphQL の行のスレッドの ID */
const threadParam = (c: Context) => z.string().regex(/^[A-Za-z0-9_=-]{1,200}$/, "スレッドの ID が正しくありません").parse(c.req.param("thread"));

const queriesOf = (c: Context) => Object.fromEntries(["kind", "state", "mine", "labels", "assignees", "milestones", "q", "sort", "cursor", "refresh"].map((k) => [k, queryOf(c, k)]));

/**
 * GitHub タブ（要件 5.11 の段階 1「読む」・段階 2「AI に渡す」・段階 3「書く」。core/github/service.ts）: 連携の状態・絞り込みの候補・一覧・issue と PR の中身・PR の変更・PR のブランチのワークツリー、
 * コメント・閉じる / 開き直す・ラベル・issue の作成・レビューの送信・スレッドへの返信と解決・マージ・チェックアウト。
 * 端末には開かない（http/deviceAccess.ts。中身は DB に持たず、開くたびに GitHub に聞く。gh はプロジェクトで選んだアカウントで動かす）
 */
export function githubRoutes(app: Hono, { store, github, prWatch }: ServerDeps) {
  const { withProject } = lookups(store);

  app.get("/api/projects/:id/github/connection", withProject, async (c) => c.json(await github.connection(c.var.project)));
  app.get("/api/projects/:id/github/meta", withProject, async (c) => c.json(await github.meta(c.var.project)));

  app.get("/api/projects/:id/github/items", withProject, async (c) => {
    const query = listQuery.parse(queriesOf(c));
    return c.json(await github.list(c.var.project, filterOfQuery(query), { cursor: query.cursor ?? null, refresh: query.refresh === "1" }));
  });

  // ?cached=1 は GitHub に聞かずに、最後に取った中身（なければ null）。開き直したときのつなぎの表示
  app.get("/api/projects/:id/github/issues/:number", withProject, async (c) =>
    c.json(queryOf(c, "cached") === "1" ? github.cachedDetail(c.var.project, "issue", idParam(c, "number")) : await github.issue(c.var.project, idParam(c, "number"))),
  );
  app.get("/api/projects/:id/github/pulls/:number", withProject, async (c) =>
    c.json(queryOf(c, "cached") === "1" ? github.cachedDetail(c.var.project, "pr", idParam(c, "number")) : await github.pull(c.var.project, idParam(c, "number"))),
  );
  // レビューコメントで直す: PR のブランチのワークツリー（いまあればそれ、なければ作る）
  app.post("/api/projects/:id/github/pulls/:number/worktree", withProject, async (c) => c.json(await github.pullWorktree(c.var.project, idParam(c, "number"))));
  // 本文の画像のうち、連携先のリポジトリの中のファイルを指すもの（非公開のリポジトリでも、コアが gh api で取って返す）
  app.get("/api/projects/:id/github/image", withProject, async (c) => {
    const url = z.string().min(1).max(4000).parse(queryOf(c, "url"));
    const { bytes, type } = await github.repoImage(c.var.project, url);
    return c.body(new Uint8Array(bytes), 200, {
      "Content-Type": type,
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      // 1 分ごとの取り直しで本文を描き直すたびに聞きに行かないよう、少しの間この画面で覚えさせる
      "Cache-Control": "private, max-age=300",
    });
  });
  app.get("/api/projects/:id/github/pulls/:number/files", withProject, async (c) => c.json(await github.pullFiles(c.var.project, idParam(c, "number"))));

  // ---- 書き込み（段階 3）。様子が変わるだけのものは 204（画面が中身を取り直す） ----
  app.post("/api/projects/:id/github/items/:number/comments", withProject, async (c) => {
    await github.comment(c.var.project, idParam(c, "number"), commentBody.parse(await jsonBody(c)).body);
    return c.body(null, 204);
  });
  app.post("/api/projects/:id/github/issues/:number/state", withProject, async (c) => {
    await github.setState(c.var.project, "issue", idParam(c, "number"), stateBody.parse(await jsonBody(c)));
    return c.body(null, 204);
  });
  app.post("/api/projects/:id/github/pulls/:number/state", withProject, async (c) => {
    await github.setState(c.var.project, "pr", idParam(c, "number"), stateBody.parse(await jsonBody(c)));
    return c.body(null, 204);
  });
  app.put("/api/projects/:id/github/items/:number/labels", withProject, async (c) => c.json(await github.setLabels(c.var.project, idParam(c, "number"), labelsBody.parse(await jsonBody(c)))));
  app.post("/api/projects/:id/github/issues", withProject, async (c) => c.json(await github.createIssue(c.var.project, newIssueBody.parse(await jsonBody(c))), 201));
  app.post("/api/projects/:id/github/pulls/:number/reviews", withProject, async (c) => {
    await github.review(c.var.project, idParam(c, "number"), reviewBody.parse(await jsonBody(c)));
    return c.body(null, 204);
  });
  app.post("/api/projects/:id/github/pulls/:number/threads/:thread/replies", withProject, async (c) => {
    idParam(c, "number");
    await github.replyToThread(c.var.project, threadParam(c), replyBody.parse(await jsonBody(c)).body);
    return c.body(null, 204);
  });
  app.post("/api/projects/:id/github/pulls/:number/threads/:thread/resolve", withProject, async (c) => {
    idParam(c, "number");
    await github.resolveThread(c.var.project, threadParam(c), resolveBody.parse(await jsonBody(c)));
    return c.body(null, 204);
  });
  // マージしたら、ワークツリーの PR の見張りにその場で聞き直させる（ワークツリーがあれば片付けの確認が出る）
  app.post("/api/projects/:id/github/pulls/:number/merge", withProject, async (c) => {
    const result = await github.merge(c.var.project, idParam(c, "number"), mergeBody.parse(await jsonBody(c)));
    void prWatch.checkProject(c.var.project.id);
    return c.json(result);
  });
  app.post("/api/projects/:id/github/pulls/:number/checkout", withProject, async (c) =>
    c.json(await github.pullCheckout(c.var.project, idParam(c, "number"), checkoutBody.parse(await jsonBody(c)).place)),
  );
}
