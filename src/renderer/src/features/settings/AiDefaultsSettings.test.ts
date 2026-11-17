import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@shared/types";
import { AiDefaultsSettings } from "./AiDefaultsSettings";

vi.mock("@/stores/providers", () => ({
  useModels: () => [],
  useProviders: () => ({ data: [{ id: "codex", implemented: true, installed: true, logged_in: true }] }),
}));

vi.mock("./useSettingsDraft", () => ({
  useSettingsDraft: () => ({ draft: DEFAULT_SETTINGS, setDraft: () => {}, dirty: false, save: {}, saveFields: () => {} }),
}));

test("AI の既定は適用範囲と AI ごとの設定を区別して表示する", () => {
  const html = renderToStaticMarkup(createElement(AiDefaultsSettings));
  for (const text of ["新しいプロジェクト", "新しいチャット", "Claude Code", "Codex", "モデル", "推論の深さ", "権限モード", "ファストモードを使う"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes('aria-labelledby="ai-defaults-claude-title"'));
  assert.ok(html.includes('aria-labelledby="ai-defaults-codex-title"'));
  assert.ok(html.includes("そのチャットだけに適用"));
  assert.ok(html.includes("コマンドのサンドボックスを使う"));
  assert.ok(html.includes("チャットの編集先を制限する"));
  assert.ok(html.includes("既存のチャットは、ここで再びオンにしても変わりません"));
});
