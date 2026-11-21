// 埋め込みブラウザの「ブラウザ」の節（browser の contributor）を、どの AI にも同じに渡し、送るたびに設定を読み直す
import assert from "node:assert/strict";
import { test } from "vitest";
import type { LinkOpenTarget } from "@shared/settings/types";
import { ScriptedProvider } from "@/features/ai/core/testing/fakeProvider";
import { browserTurnParts } from "@/features/browser/core/index";
import { setupCore, until } from "@/app/core/testing/testCore";

test("ブラウザの開き先を Claude Code と Codex に共通で伝え、同じ会話の続きでも設定を読み直す", async () => {
  // ブラウザ自体は操作しない。提供の有無と、渡される指示だけを確かめる
  for (const id of ["claude", "codex"] as const) {
    const ctx = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" })), { contributors: [browserTurnParts((): LinkOpenTarget => ctx.store.settings.get().link_open_in)] });
    const { store, runner, provider, project } = ctx;
    store.projects.update(project.id, { provider: id });
    const chat = await runner.start({ projectId: project.id, prompt: "ページを開いて" });
    await until(() => store.chats.get(chat.id)?.status === "completed");
    assert.equal(store.chats.get(chat.id)?.provider, id);
    assert.match(provider.calls[0].systemPrompt, /既定の開き先は「Kickoff のブラウザ」/);
    store.settings.update({ link_open_in: "browser" });
    await runner.send(chat.id, "もう一度開いて");
    await until(() => store.chats.get(chat.id)?.status === "completed" && provider.calls.length === 2);
    assert.match(provider.calls[1].systemPrompt, /既定の開き先は「既定のブラウザ」/);
    assert.doesNotMatch(provider.calls[1].systemPrompt, /既定の開き先は「Kickoff のブラウザ」/);
  }
});

