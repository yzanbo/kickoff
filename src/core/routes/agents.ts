import type { Hono } from "hono";
import { z } from "zod";
import { githubStatus } from "../github.js";
import type { ServerDeps } from "../server.js";
import { PROVIDER_IDS, type ApprovalDecision, type ModelOption, type ProviderId, type SlashCommandOption } from "../types.js";
import { HttpError, requireProject, requireWorkdir } from "./http.js";

const decisionSchema: z.ZodType<ApprovalDecision> = z.discriminatedUnion("action", [
  z.object({ action: z.literal("allow") }),
  z.object({ action: z.literal("allow_always") }),
  z.object({ action: z.literal("deny"), message: z.string().max(5000).optional() }),
  z.object({
    action: z.literal("answer"),
    answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    response: z.string().max(5000).optional(),
  }),
]);

/** 承認依頼・AI からの質問への回答、外部 CLI（Claude など）の状態とモデル一覧、プランの使用枠・サービスごとの使用状況 */
export function agentRoutes(app: Hono, { store, providers, usage, serviceUsage, approvals }: ServerDeps) {
  // ---- 承認依頼・AI からの質問 ----
  app.get("/api/approvals", (c) => {
    const projectId = c.req.query("project_id");
    return c.json(approvals.list({ projectId: projectId ? Number(projectId) : undefined }));
  });

  app.post("/api/approvals/:id", async (c) => {
    const decision = decisionSchema.parse(await c.req.json());
    if (!approvals.resolve(c.req.param("id"), decision)) throw new HttpError(404, "この依頼はすでに回答済みか、中断されています");
    return c.json({ ok: true });
  });

  // ---- 外部 CLI の状態 ----
  app.get("/api/providers", async (c) =>
    c.json(await Promise.all(PROVIDER_IDS.map((id) => providers[id].status()))),
  );
  app.get("/api/github", async (c) => c.json(await githubStatus()));

  // チャット欄のモデル一覧（取得に 1 秒ほどかかるのでキャッシュする）
  const modelCache = new Map<ProviderId, { at: number; models: ModelOption[] }>();
  app.get("/api/providers/:id/models", async (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    const cached = modelCache.get(id);
    if (cached && Date.now() - cached.at < 60 * 60_000) return c.json(cached.models);
    const models = (await providers[id].models?.()) ?? [];
    if (models.length > 0) modelCache.set(id, { at: Date.now(), models });
    return c.json(models);
  });

  // チャット欄の / で出すコマンド（作業場所ごと。プロジェクトのコマンド・スキルも含むので、作業場所のフォルダで調べる。数分はとっておく）
  const commandCache = new Map<string, { at: number; commands: SlashCommandOption[] }>();
  app.get("/api/projects/:id/commands", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const cwd = await requireWorkdir(project.repo_path, c.req.query("worktree"));
    const key = `${project.provider}:${cwd}`;
    const cached = commandCache.get(key);
    if (cached && Date.now() - cached.at < 5 * 60_000) return c.json(cached.commands);
    const commands = (await providers[project.provider].commands?.(cwd)) ?? [];
    if (commands.length > 0) commandCache.set(key, { at: Date.now(), commands });
    return c.json(commands);
  });

  // ---- プランの使用枠（5 時間・週） ----
  app.get("/api/usage", async (c) => c.json(await usage.get()));
  app.post("/api/usage/refresh", async (c) => c.json(await usage.refresh(true)));
  // サービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）。設定の「使用状況」
  app.get("/api/usage/services", async (c) => c.json(await serviceUsage.get()));
  app.post("/api/usage/services/refresh", async (c) => c.json(await serviceUsage.refresh(true)));
}
