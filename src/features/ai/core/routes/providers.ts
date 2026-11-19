import type { Hono } from "hono";
import { z } from "zod";
import { claudeEffortDefault } from "@/features/ai/core/providers/claude/effortDefault";
import { githubStatus } from "@/features/github/core/github";
import type { Bus } from "@/foundation/core/bus";
import type { Store } from "@/foundation/core/db/store";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import type { ProviderKeyVault } from "@/features/ai/core/providers/keys";
import { PROVIDER_IDS, type ProviderId, type ProviderLoginStart, type SlashCommandOption } from "@shared/types";
import { ttlCache } from "@/foundation/core/system/ttlCache";
import { lookups } from "@/foundation/core/http/lookups";
import { providerFeatures } from "@/features/ai/core/providers/features";
import { providerModels } from "@/features/ai/core/providers/modelCatalog";
import { jsonBody } from "@/foundation/core/http/input";
import { Invalid } from "@/foundation/core/errors";
import type { ProviderLogin } from "@/features/ai/core/providers/types";
import { errorMessage } from "@shared/foundation/errors";

/** 外部 CLI（Claude などのプロバイダー・gh）の状態、チャット欄のモデルの一覧・/ のコマンド・既定の推論の深さ */
export function providerRoutes(app: Hono, { store, providers, providerKeys, bus }: { store: Store; providers: Record<ProviderId, AgentProvider>; providerKeys: ProviderKeyVault; bus: Bus }) {
  const { withWorkdir } = lookups(store);

  // AI のブラウザでのログイン。AI ごとに 1 つだけ持ち（メモリだけ）、始め直したら前のものはやめる。
  // 終わったら provider_login を知らせる（画面は AI の状態を読み直す）。CLI が自分で資格情報を書くので、Kickoff は資格情報を持たない
  const logins = new Map<ProviderId, ProviderLogin>();
  // 利用者がやめたログイン（終わりを「やめた」として知らせる）
  const cancelledLogins = new WeakSet<ProviderLogin>();
  app.post("/api/providers/:id/login", async (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    const provider = providers[id];
    if (!provider.login) throw new Invalid(`${provider.label} は Kickoff からブラウザでログインできません`);
    // 前のログインは覚えから外してからやめる（やめた知らせが、いまのログインの失敗として流れないように）
    const previous = logins.get(id);
    if (previous) {
      logins.delete(id);
      previous.cancel();
    }
    const login = await provider.login().catch((e: unknown) => {
      throw new Invalid(`ログインを始められませんでした: ${errorMessage(e)}`);
    });
    logins.set(id, login);
    void login.completed.then(
      () => bus.publish({ type: "provider_login", provider: id, status: "completed", error: null }),
      (e: unknown) => {
        // 始め直したときの前のものは知らせない（いまのログインの様子と取り違えるため）
        if (logins.get(id) !== login) return;
        const cancelled = cancelledLogins.has(login);
        bus.publish({ type: "provider_login", provider: id, status: cancelled ? "cancelled" : "failed", error: cancelled ? null : errorMessage(e) });
      },
    ).finally(() => {
      if (logins.get(id) === login) logins.delete(id);
    });
    return c.json({ auth_url: login.authUrl } satisfies ProviderLoginStart);
  });
  // やめる（始めていなければ何もしない）
  app.delete("/api/providers/:id/login", (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    const login = logins.get(id);
    if (login) {
      cancelledLogins.add(login);
      login.cancel();
    }
    return c.body(null, 204);
  });

  // 状態に、その AI でできること（features）を添える（画面がないものを押せない形にする）
  // ログインの仕方と、API キーを置いたか（キーそのものは出さない）も添える
  app.get("/api/providers", async (c) => {
    const auth = store.settings.get().provider_auth;
    return c.json(
      await Promise.all(
        PROVIDER_IDS.map(async (id) => ({ ...(await providers[id].status()), features: providerFeatures(providers[id]), auth_mode: auth[id] ?? "subscription", has_api_key: providerKeys.has(id) })),
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
  app.get("/api/github", async (c) => c.json(await githubStatus()));

  // チャット欄のモデル一覧（一覧にないモデルを外す守りと同じものを覚えて使う）
  app.get("/api/providers/:id/models", async (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    return c.json(await providerModels(providers[id]));
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
