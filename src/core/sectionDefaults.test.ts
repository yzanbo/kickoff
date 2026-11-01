import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRunDefaults } from "./sectionDefaults.js";
import { DEFAULT_SETTINGS } from "./types.js";

test("新しいチャットの既定: プロジェクトの既定があれば優先し、なければアプリ全体の設定", () => {
  const settings = { ...DEFAULT_SETTINGS, claudeModel: "opus", defaultEffort: "high" as const, defaultFastMode: true };
  assert.deepEqual(resolveRunDefaults(settings), { model: "opus", effort: "high", permission: "phase", fastMode: true });
  // effort の null は「セクションに合わせる」をプロジェクトで選んだ意味なので、アプリの設定より優先する
  assert.deepEqual(resolveRunDefaults(settings, { model: "haiku", effort: null, permission: "plan", fastMode: false }), {
    model: "haiku",
    effort: null,
    permission: "plan",
    fastMode: false,
  });
});
