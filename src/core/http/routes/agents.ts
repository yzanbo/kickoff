import { claudeEffortDefault } from "../../providers/claude/effortDefault.js";
import type { Hono } from "hono";
import { z } from "zod";
import { githubStatus } from "../../git/github.js";
import type { ServerDeps } from "../server.js";
import { PROVIDER_IDS, type ApprovalDecision, type ModelOption, type ProviderId, type SlashCommandOption } from "@shared/types";
import { ttlCache } from "../../system/ttlCache.js";
import { HttpError, requireProject, requireWorkdir } from "./http.js";
import { attachmentSchema, optionalId, queryOf } from "./schemas.js";
import { answersWithAttachments } from "../../chat/uploads.js";

const decisionSchema: z.ZodType<ApprovalDecision> = z.discriminatedUnion("action", [
  z.object({ action: z.literal("allow") }),
  z.object({ action: z.literal("allow_always") }),
  z.object({ action: z.literal("deny"), message: z.string().max(5000).optional() }),
  z.object({
    action: z.literal("answer"),
    answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    response: z.string().max(5000).optional(),
    attachments: z.record(z.string(), z.array(attachmentSchema).max(20)).optional(),
  }),
]);

/** 承認依頼・AI からの質問への回答、外部 CLI（Claude など）の状態とモデル一覧、プランの使用枠・サービスごとの使用状況 */
export function agentRoutes(app: Hono, { store, providers, usage, serviceUsage, approvals, uploads }: ServerDeps) {
  // ---- 承認依頼・AI からの質問 ----
  app.get("/api/approvals", (c) => {
    const { project_id } = z.object({ project_id: optionalId }).parse({ project_id: queryOf(c, "project_id") });
    return c.json(approvals.list({ projectId: project_id }));
  });

  app.post("/api/approvals/:id", async (c) => {
    let decision = decisionSchema.parse(await c.req.json());
    // 「その他」に添えた添付は、回答の文にパスを書き添えてから渡す（Claude Code には文字の回答しか渡せない）
    if (decision.action === "answer" && decision.attachments) {
      const { attachments, ...rest } = decision;
      // AI には添付のパスを書き添えた回答を渡し、チャットの記録には選んだままの回答と添付を残す
      decision = { ...rest, answers: await answersWithAttachments(uploads, rest.answers, attachments), plain: rest.answers, attachments };
    }
    if (!approvals.resolve(c.req.param("id"), decision)) throw new HttpError(404, "この依頼はすでに回答済みか、中断されています");
    return c.json({ ok: true });
  });

  // ---- 外部 CLI の状態 ----
  app.get("/api/providers", async (c) =>
    c.json(await Promise.all(PROVIDER_IDS.map((id) => providers[id].status()))),
  );
  app.get("/api/github", async (c) => c.json(await githubStatus()));

  // チャット欄のモデル一覧（取得に 1 秒ほどかかるので 1 時間はとっておく。空の結果は覚えない）
  const modelCache = ttlCache<ProviderId, ModelOption[]>(60 * 60_000);
  app.get("/api/providers/:id/models", async (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    const cached = modelCache.get(id);
    if (cached) return c.json(cached);
    const models = (await providers[id].models?.()) ?? [];
    if (models.length > 0) modelCache.set(id, models);
    return c.json(models);
  });

  // チャット欄の / で出すコマンド（作業場所ごと。プロジェクトのコマンド・スキルも含むので、作業場所のフォルダで調べる。数分はとっておく）
  const commandCache = ttlCache<string, SlashCommandOption[]>(5 * 60_000);
  // 推論の深さを指定しないとき（既定）に Claude Code が使う深さ（設定から求める。?model= はモデルの ID、?worktree= は作業場所）
  app.get("/api/projects/:id/effort-default", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const cwd = await requireWorkdir(c, project);
    return c.json(await claudeEffortDefault(c.req.query("model") || null, cwd));
  });

  app.get("/api/projects/:id/commands", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const cwd = await requireWorkdir(c, project);
    const key = `${project.provider}:${cwd}`;
    const cached = commandCache.get(key);
    if (cached) return c.json(cached);
    const commands = (await providers[project.provider].commands?.(cwd)) ?? [];
    if (commands.length > 0) commandCache.set(key, commands);
    return c.json(commands);
  });

  // ---- プランの使用枠（5 時間・週） ----
  app.get("/api/usage", async (c) => c.json(await usage.get()));
  app.post("/api/usage/refresh", async (c) => c.json(await usage.refresh(true)));
  // サービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）。設定の「使用状況」
  app.get("/api/usage/services", async (c) => c.json(await serviceUsage.get()));
  app.post("/api/usage/services/refresh", async (c) => c.json(await serviceUsage.refresh(true)));
}
