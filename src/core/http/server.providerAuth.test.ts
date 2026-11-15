// AI の一覧・できること・ログインの仕方と API キー・チャットごとの AI（メモの仕様書「0021」の段階 2: Q1・Q4・Q8・Q13）
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_IDS, type Chat, type ProviderStatus } from "@shared/types";
import { setup } from "../testing/testServer.js";
import { until } from "../testing/testCore.js";
import { ProviderKeyVault } from "../providers/keys.js";
import { providerFeatures } from "../providers/features.js";
import { claudeAuthEnv } from "../providers/claude/env.js";
import { Store } from "../db/store.js";
import type { SecretCipher } from "../system/sealedSecret.js";
import type { AgentProvider } from "../providers/types.js";

/** 中身を逆さにするだけの暗号化（テスト用） */
const reverseCipher: SecretCipher = {
  encrypt: async (plain) => [...plain].reverse().join(""),
  decrypt: async (sealed) => [...sealed].reverse().join(""),
};

test("AI の一覧: 5 つの AI と、できること・ログインの仕方・API キーを置いたかを返す（キーそのものは返さない）", async () => {
  const { call } = setup({ secretCipher: reverseCipher });
  const before = (await call("GET", "/api/providers")).body as ProviderStatus[];
  // テストの偽のプロバイダーはどの AI として呼ばれても同じもの（数だけ見る）
  assert.equal(before.length, PROVIDER_IDS.length);
  assert.ok(before.every((p) => Array.isArray(p.features) && p.auth_mode === "subscription" && p.has_api_key === false));

  assert.equal((await call("PUT", "/api/providers/codex/api-key", { key: "sk-test-123" })).status, 204);
  await call("PUT", "/api/settings", { provider_auth: { codex: "api_key" } });
  const after = (await call("GET", "/api/providers")).body as ProviderStatus[];
  const codex = after[PROVIDER_IDS.indexOf("codex")];
  assert.equal(codex.auth_mode, "api_key");
  assert.equal(codex.has_api_key, true);
  assert.ok(!JSON.stringify(after).includes("sk-test-123"));

  assert.equal((await call("PUT", "/api/providers/codex/api-key", { key: null })).status, 204);
  assert.equal(((await call("GET", "/api/providers")).body as ProviderStatus[])[PROVIDER_IDS.indexOf("codex")].has_api_key, false);
  assert.equal((await call("PUT", "/api/providers/nope/api-key", { key: "x" })).status, 400);
});

test("API キー: 暗号化して置き、設定が API キーのときだけ開いて渡す", async () => {
  const store = new Store(":memory:");
  const vault = new ProviderKeyVault(store, reverseCipher);
  await vault.set("claude", "  sk-ant-1  ");
  assert.equal(store.secrets.get("provider_api_key:claude"), "safe:v1:1-tna-ks");
  assert.deepEqual(await vault.authFor("claude"), { mode: "subscription", apiKey: null });
  store.settings.update({ provider_auth: { claude: "api_key" } });
  assert.deepEqual(await vault.authFor("claude"), { mode: "api_key", apiKey: "sk-ant-1" });
  // 置いていない AI は API キーの設定でもキーなし（実行は分かる文で止める）
  store.settings.update({ provider_auth: { claude: "api_key", codex: "api_key" } });
  assert.deepEqual(await vault.authFor("codex"), { mode: "api_key", apiKey: null });
  // 開けない（キーチェーンで拒否）ならキーなし
  const locked = new ProviderKeyVault(store, { encrypt: reverseCipher.encrypt, decrypt: async () => Promise.reject(new Error("拒否")) });
  assert.deepEqual(await locked.authFor("claude"), { mode: "api_key", apiKey: null });
});

test("Claude Code に渡す API キー: API キーのときだけ、子プロセスから外す印と一緒に渡す", () => {
  assert.deepEqual(claudeAuthEnv(undefined), {});
  assert.deepEqual(claudeAuthEnv({ mode: "subscription", apiKey: null }), {});
  assert.deepEqual(claudeAuthEnv({ mode: "api_key", apiKey: null }), {});
  assert.deepEqual(claudeAuthEnv({ mode: "api_key", apiKey: "k" }), { ANTHROPIC_API_KEY: "k", CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1" });
});

test("できること: プロバイダーが持つ任意の機能から決める", () => {
  const base = { id: "codex", label: "x", implemented: true, status: async () => ({}), run: async () => ({ status: "completed", sessionId: null }) } as unknown as AgentProvider;
  assert.deepEqual(providerFeatures(base), []);
  const more = { ...base, usage: async () => ({}), models: async () => [], fork: async () => "s" } as unknown as AgentProvider;
  assert.deepEqual(providerFeatures(more), ["fork", "usage", "models"]);
});

test("新しいチャット: AI を選べ（省けばプロジェクトの AI）、子チャットの既定は親と同じ。違う AI の子チャットは会話を引き継がない", async () => {
  const { call, store, project } = setup();
  const plain = (await call("POST", `/api/projects/${project.id}/chats`, { text: "x" })).body as Chat;
  assert.equal(plain.provider, "claude");
  const codex = (await call("POST", `/api/projects/${project.id}/chats`, { text: "y", provider: "codex" })).body as Chat;
  assert.equal(codex.provider, "codex");
  await until(() => store.chats.get(codex.id)?.status !== "running");

  const child = (await call("POST", `/api/chats/${codex.id}/children`, { text: "z", inherit: false })).body as Chat;
  assert.equal(child.provider, "codex");
  const other = (await call("POST", `/api/chats/${codex.id}/children`, { text: "w", inherit: true, provider: "claude" })).body as Chat;
  assert.equal(other.provider, "claude");
  await until(() => store.events.list(other.id).some((e) => e.type === "notice"));
  const notice = store.events.list(other.id).find((e) => e.type === "notice");
  assert.ok(notice?.type === "notice" && notice.data.message.includes("AI が違うので"));
  assert.equal((await call("POST", `/api/projects/${project.id}/chats`, { text: "q", provider: "nope" })).status, 400);
});
