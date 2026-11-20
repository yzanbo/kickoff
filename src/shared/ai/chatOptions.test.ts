import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveChatOptions } from "./chatOptions";
import { DEFAULT_SETTINGS, PROVIDER_BASE_CHAT_OPTIONS, type AppSettings } from "@shared/settings/types";

/** その AI のアプリの既定だけを変えた設定 */
const withDefaults = (defaults: Partial<AppSettings["provider_chat_defaults"]>) => ({ ...DEFAULT_SETTINGS, provider_chat_defaults: { ...DEFAULT_SETTINGS.provider_chat_defaults, ...defaults } });

test("チャットの選択: アプリの既定の上に、プロジェクトの既定 → 送るときの指定の順で、書いてある項目だけを重ねる", () => {
  const settings = withDefaults({ claude: { model: "opus", effort: "high", permission_mode: "default", fast_mode: true } });
  assert.deepEqual(resolveChatOptions(settings, "claude"), { model: "opus", effort: "high", permission_mode: "default", fast_mode: true });
  // effort の null は「指定しない（モデルの既定）」をプロジェクトで選んだ意味なので、アプリの設定より優先する
  assert.deepEqual(resolveChatOptions(settings, "claude", { provider_chat_defaults: { claude: { model: "haiku", effort: null, permission_mode: "plan", fast_mode: false } } }), {
    model: "haiku",
    effort: null,
    permission_mode: "plan",
    fast_mode: false,
  });
  // 書いていない項目（undefined）は、次の段に従う
  assert.deepEqual(resolveChatOptions(settings, "claude", { provider_chat_defaults: { claude: { model: "haiku" } } }, { effort: undefined, fast_mode: false }), {
    model: "haiku",
    effort: "high",
    permission_mode: "default",
    fast_mode: false,
  });
});

test("どこでも決めていなければ、推論の深さは指定せず、権限モードは毎回確認", () => {
  assert.deepEqual(resolveChatOptions(DEFAULT_SETTINGS, "claude"), { model: "opus", effort: null, permission_mode: "default", fast_mode: false });
});

test("Claude Code 以外の AI には、Claude Code の既定（モデルの名前など）を重ねない（メモの仕様書「0028」の G2）", () => {
  const settings = withDefaults({ claude: { model: "opus", effort: "high", permission_mode: "auto", fast_mode: true } });
  const project = { provider_chat_defaults: { claude: { model: "sonnet", effort: "low" as const } } };
  assert.deepEqual(resolveChatOptions(settings, "codex", project), PROVIDER_BASE_CHAT_OPTIONS);
  // 送るときの指定は、どの AI でも重ねる
  assert.deepEqual(resolveChatOptions(settings, "codex", project, { model: "gpt-6-luna" }), { ...PROVIDER_BASE_CHAT_OPTIONS, model: "gpt-6-luna" });
});

test("Claude Code のほかの AI は、アプリの既定 → プロジェクトの既定の順に、その AI の分だけを重ねる（メモの仕様書「0028」の 9 節）", () => {
  const settings = withDefaults({ codex: { model: "gpt-6-luna", effort: "low", permission_mode: "auto", fast_mode: false } });
  assert.deepEqual(resolveChatOptions(settings, "codex"), { model: "gpt-6-luna", effort: "low", permission_mode: "auto", fast_mode: false });
  const project = { provider_chat_defaults: { claude: { model: "sonnet" }, codex: { effort: "high" as const } } };
  assert.deepEqual(resolveChatOptions(settings, "codex", project), { model: "gpt-6-luna", effort: "high", permission_mode: "auto", fast_mode: false });
  // Claude Code にはほかの AI の既定を重ねない
  assert.equal(resolveChatOptions(settings, "claude", project).model, "sonnet");
  // 決めていない AI は初めの既定
  assert.deepEqual(resolveChatOptions(settings, "copilot", project), PROVIDER_BASE_CHAT_OPTIONS);
});
