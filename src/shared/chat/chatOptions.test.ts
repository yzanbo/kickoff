import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveChatOptions } from "./chatOptions";
import { DEFAULT_SETTINGS } from "@shared/types";

test("チャットの選択: アプリの既定の上に、プロジェクトの既定 → 送るときの指定の順で、書いてある項目だけを重ねる", () => {
  const settings = { ...DEFAULT_SETTINGS, chat_defaults: { model: "opus", effort: "high" as const, permission_mode: "default" as const, fast_mode: true } };
  assert.deepEqual(resolveChatOptions(settings), { model: "opus", effort: "high", permission_mode: "default", fast_mode: true });
  // effort の null は「指定しない（モデルの既定）」をプロジェクトで選んだ意味なので、アプリの設定より優先する
  assert.deepEqual(resolveChatOptions(settings, { model: "haiku", effort: null, permission_mode: "plan", fast_mode: false }), {
    model: "haiku",
    effort: null,
    permission_mode: "plan",
    fast_mode: false,
  });
  // 書いていない項目（undefined）は、次の段に従う
  assert.deepEqual(resolveChatOptions(settings, { model: "haiku" }, { effort: undefined, fast_mode: false }), {
    model: "haiku",
    effort: "high",
    permission_mode: "default",
    fast_mode: false,
  });
});

test("どこでも決めていなければ、推論の深さは指定せず、権限モードは毎回確認", () => {
  assert.deepEqual(resolveChatOptions(DEFAULT_SETTINGS), { model: "opus", effort: null, permission_mode: "default", fast_mode: false });
});
