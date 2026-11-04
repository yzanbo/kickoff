import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRunDefaults } from "@shared/chat/chatOptions";
import { DEFAULT_SETTINGS } from "@shared/types";

test("新しいチャットの既定: プロジェクトの既定があれば優先し、なければアプリ全体の設定", () => {
  const settings = { ...DEFAULT_SETTINGS, claudeModel: "opus", defaultEffort: "high" as const, defaultFastMode: true };
  assert.deepEqual(resolveRunDefaults(settings), { model: "opus", effort: "high", permission: "default", fastMode: true });
  // effort の null は「指定しない（モデルの既定）」をプロジェクトで選んだ意味なので、アプリの設定より優先する
  assert.deepEqual(resolveRunDefaults(settings, { model: "haiku", effort: null, permission: "plan", fastMode: false }), {
    model: "haiku",
    effort: null,
    permission: "plan",
    fastMode: false,
  });
});

test("どこでも決めていなければ、推論の深さは指定せず、権限モードは毎回確認", () => {
  assert.deepEqual(resolveRunDefaults(DEFAULT_SETTINGS), { model: DEFAULT_SETTINGS.claudeModel, effort: null, permission: "default", fastMode: false });
});
