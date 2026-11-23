import { test } from "vitest";
import assert from "node:assert/strict";
import { ScriptedProvider } from "@/features/ai/core/testing/fakeProvider";
import { setupCore, until } from "@/app/core/testing/testCore";

const bashSandbox = { rules: { tempDirs: [], writableDirs: async () => [], unsandboxedCommands: [] }, proxyPort: null, trashDir: null };
const makeProvider = () => new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));

for (const providerId of ["claude", "codex"] as const) {
  for (const sandboxEnabled of [true, false]) for (const editScopeEnabled of [true, false]) {
    test(`${providerId}: 砂場 ${sandboxEnabled}・編集先の制限 ${editScopeEnabled} を独立して新しいチャットに渡す`, async () => {
      const provider = makeProvider();
      const { store, runner, project, gateMaterials } = setupCore(provider, { bashSandbox });
      store.settings.update({ sandbox_enabled_by_default: sandboxEnabled, edit_scope_enabled_by_default: editScopeEnabled });
      const chat = await runner.start({ projectId: project.id, provider: providerId, prompt: "確認" });
      await until(() => store.chats.get(chat.id)?.status === "completed");
      assert.equal(chat.sandbox_enabled, sandboxEnabled);
      assert.equal(chat.edit_scope_enabled, editScopeEnabled);
      assert.equal(Boolean(provider.calls[0].sandbox), sandboxEnabled);
      assert.equal(provider.calls[0].sandboxOff, !sandboxEnabled);
      assert.equal(Boolean(gateMaterials[0].writeScope), editScopeEnabled);
    });
  }
}

test("既定を変えても既存のチャットは変わらず、新規だけがその値になる", async () => {
  const provider = makeProvider();
  const { store, runner, project, gateMaterials } = setupCore(provider, { bashSandbox });
  const existing = await runner.start({ projectId: project.id, prompt: "既存" });
  await until(() => store.chats.get(existing.id)?.status === "completed");
  store.settings.update({ sandbox_enabled_by_default: false, edit_scope_enabled_by_default: false });
  await runner.message(existing.id, { text: "続き" });
  await until(() => store.chats.get(existing.id)?.status === "completed" && provider.calls.length === 2);
  assert.equal(provider.calls[1].sandboxOff, false);
  assert.ok(gateMaterials[1].writeScope);
  const created = await runner.start({ projectId: project.id, prompt: "新規" });
  await until(() => store.chats.get(created.id)?.status === "completed");
  assert.equal(provider.calls[2].sandboxOff, true);
  assert.equal(gateMaterials[2].writeScope, null);
  store.settings.update({ sandbox_enabled_by_default: true, edit_scope_enabled_by_default: true });
  await runner.message(created.id, { text: "続き" });
  await until(() => store.chats.get(created.id)?.status === "completed" && provider.calls.length === 4);
  assert.equal(provider.calls[3].sandboxOff, true);
  assert.equal(gateMaterials[3].writeScope, null);
});

test("計画モードと AI で整えるチャットでは、砂場の既定をオフにしても専用の保護を外さない", async () => {
  const provider = makeProvider();
  const { store, runner, project, gateMaterials } = setupCore(provider, { bashSandbox });
  store.settings.update({ sandbox_enabled_by_default: false, edit_scope_enabled_by_default: false });
  const plan = await runner.start({ projectId: project.id, provider: "codex", prompt: "計画", options: { permission_mode: "plan" } });
  await until(() => store.chats.get(plan.id)?.status === "completed");
  assert.equal(provider.calls[0].sandboxOff, false);
  assert.ok(provider.calls[0].sandbox);
  const tidy = await runner.start({ projectId: project.id, provider: "claude", prompt: "整理", untrackedOnly: true });
  await until(() => store.chats.get(tidy.id)?.status === "completed");
  assert.equal(provider.calls[1].sandboxOff, false);
  assert.ok(provider.calls[1].sandbox);
  assert.equal(gateMaterials[1].untrackedOnly, true);
});

test("砂場オフに未対応の AI は、制限なしで動かす代わりに失敗を知らせる", async () => {
  const provider = makeProvider();
  const { store, runner, project } = setupCore(provider, { bashSandbox });
  store.settings.update({ sandbox_enabled_by_default: false });
  const chat = await runner.start({ projectId: project.id, provider: "copilot", prompt: "確認" });
  await until(() => store.chats.get(chat.id)?.status === "failed");
  assert.match(store.chats.get(chat.id)?.error ?? "", /サンドボックスをオフ.*未対応|サンドボックスをオフ.*対応していません/);
  assert.equal(provider.calls.length, 0);
});
