import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import { ChatDefaultsFields } from "./ChatDefaultsFields";

vi.mock("@/features/ai/ui/stores/providers", () => ({ useModels: () => [] })); // test-rules-ignore: 部品を描いて確かめる（AI の状態の店を空にする）

test("プロジェクトの AI の既定: 書いていない項目は「アプリの設定に従う」とその値を出し、アプリの設定が届くまでは「…」", () => {
  const app = { model: "opus", effort: null, permission_mode: "auto" as const, fast_mode: true };
  const html = renderToStaticMarkup(createElement(ChatDefaultsFields, { provider: "claude", value: { effort: "high" }, onChange: () => {}, inherit: app }));
  for (const text of ["モデル", "推論の深さ", "権限モード", "ファストモード", "アプリの設定に従う（使う）"]) assert.ok(html.includes(text), text);
  // Claude Code は「その AI の既定のモデル」を選べない
  assert.ok(!html.includes('<option value="">Claude'));
  const loading = renderToStaticMarkup(createElement(ChatDefaultsFields, { provider: "codex", value: {}, onChange: () => {}, inherit: null }));
  assert.ok(loading.includes("アプリの設定に従う（…）"));
  // Codex はファストモードを持たない（対応するモデルがない）
  assert.ok(!loading.includes("ファストモード"));
});
