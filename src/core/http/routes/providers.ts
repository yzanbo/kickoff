import type { Hono } from "hono";
import { z } from "zod";
import { claudeEffortDefault } from "../../providers/claude/effortDefault.js";
import { githubStatus } from "../../git/github.js";
import type { ServerDeps } from "../server.js";
import { PROVIDER_IDS, type ModelOption, type ProviderId, type SlashCommandOption } from "@shared/types";
import { ttlCache } from "../../system/ttlCache.js";
import { lookups } from "../lookups.js";

/** 外部 CLI（Claude などのプロバイダー・gh）の状態、チャット欄のモデルの一覧・/ のコマンド・既定の推論の深さ */
export function providerRoutes(app: Hono, { store, providers }: ServerDeps) {
  const { withWorkdir } = lookups(store);

  app.get("/api/providers", async (c) => c.json(await Promise.all(PROVIDER_IDS.map((id) => providers[id].status()))));
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

  // 推論の深さを指定しないとき（既定）に Claude Code が使う深さ（設定から求める。?model= はモデルの ID、?worktree= は作業場所）
  app.get("/api/projects/:id/effort-default", withWorkdir, async (c) => c.json(await claudeEffortDefault(c.req.query("model") || null, c.var.workdir)));

  // チャット欄の / で出すコマンド（作業場所ごと。プロジェクトのコマンド・スキルも含むので、作業場所のフォルダで調べる。数分はとっておく）
  const commandCache = ttlCache<string, SlashCommandOption[]>(5 * 60_000);
  app.get("/api/projects/:id/commands", withWorkdir, async (c) => {
    const { project, workdir: cwd } = c.var;
    const key = `${project.provider}:${cwd}`;
    const cached = commandCache.get(key);
    if (cached) return c.json(cached);
    const commands = (await providers[project.provider].commands?.(cwd)) ?? [];
    if (commands.length > 0) commandCache.set(key, commands);
    return c.json(commands);
  });
}
