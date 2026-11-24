import type { Hono } from "hono";
import { z } from "zod";
import type { Bus } from "@/foundation/core/bus";
import type { Kernel } from "@/foundation/core/kernel";
import type { ProjectStore } from "@/features/projects/core/index";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import type { ProviderKeyVault } from "@/features/ai/core/providers/keys";
import type { SlashCommandOption, ProviderLoginStart } from "@shared/ai/types";
import { PROVIDER_IDS, type ProviderId } from "@shared/settings/types";
import { ttlCache } from "@/foundation/core/system/ttlCache";
import { lookups } from "@/foundation/core/http/lookups";
import { capabilitiesOf } from "@/features/ai/core/capability";
import { providerModels } from "@/features/ai/core/providers/modelCatalog";
import { jsonBody } from "@/foundation/core/http/input";
import { createLoginSessions } from "@/features/ai/core/loginSessions";

/** 外部 CLI（Claude などのプロバイダー・gh）の状態、チャット欄のモデルの一覧・/ のコマンド・既定の推論の深さ */
export function providerRoutes(app: Hono, { store, providers, providerKeys, bus }: { store: Pick<Kernel, "settings"> & { projects: ProjectStore }; providers: Record<ProviderId, AgentProvider>; providerKeys: ProviderKeyVault; bus: Bus }) {
  const { withWorkdir } = lookups(store);

  // AI のブラウザでのログイン（loginSessions.ts。始め直したら前のものはやめる）
  const logins = createLoginSessions(providers, bus);
  app.post("/api/providers/:id/login", async (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    return c.json({ auth_url: await logins.start(id) } satisfies ProviderLoginStart);
  });
  // やめる（始めていなければ何もしない）
  app.delete("/api/providers/:id/login", (c) => {
    logins.cancel(z.enum(PROVIDER_IDS).parse(c.req.param("id")));
    return c.body(null, 204);
  });

  // 状態に、その AI でできること（capabilities）を添える（画面がないものを押せない形にする）
  // ログインの仕方と、API キーを置いたか（キーそのものは出さない）も添える
  app.get("/api/providers", async (c) => {
    const auth = store.settings.get().provider_auth;
    return c.json(
      await Promise.all(
        PROVIDER_IDS.map(async (id) => ({ ...(await providers[id].status()), capabilities: capabilitiesOf(providers[id]), auth_mode: auth[id] ?? "subscription", has_api_key: providerKeys.has(id) })),
      ),
    );
  });

  // AI の API キーを置く・消す（キーチェーンの鍵で暗号化して secrets に。応答は 204。キーは返さない）
  app.put("/api/providers/:id/api-key", async (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    const { key } = z.object({ key: z.string().max(4000).nullable() }).parse(await jsonBody(c));
    await providerKeys.set(id, key);
    return c.body(null, 204);
  });

  // チャット欄のモデル一覧（一覧にないモデルを外す守りと同じものを覚えて使う）
  app.get("/api/providers/:id/models", async (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    return c.json(await providerModels(providers[id]));
  });

  // 推論の深さを指定しないとき（既定）に Claude Code が使う深さ（設定から求める。?model= はモデルの ID、?worktree= は作業場所。画面は Claude のチャットでだけ聞く）
  app.get("/api/projects/:id/effort-default", withWorkdir, async (c) => c.json((await providers.claude.effortDefault?.(c.req.query("model") || null, c.var.workdir)) ?? { effort: null, source: null }));

  // チャット欄の / で出すコマンド（作業場所ごと。プロジェクトのコマンド・スキルも含むので、作業場所のフォルダで調べる。数分はとっておく）
  const commandCache = ttlCache<string, SlashCommandOption[]>({ ms: 5 * 60_000 });
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
