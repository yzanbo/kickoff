import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import { makeChat } from "@shared/testing/factories";
import { ProviderChip } from "./ProviderChips";

vi.mock("@/stores/providers", () => ({ useProviders: () => ({ data: [] }) }));

test("Claude Code・Codex は切り替えを選べ、作業中・アーカイブ中は選べない", () => {
  const render = (provider: "claude" | "codex", busy: boolean, archived = false) => renderToStaticMarkup(createElement(ProviderChip, { chat: makeChat(1, { provider, archived_at: archived ? "2026-11-18T00:00:00Z" : null }), busy }));
  assert.match(render("claude", false), /aria-haspopup="menu"/);
  assert.match(render("codex", false), /aria-haspopup="menu"/);
  assert.match(render("claude", true), /disabled=""/);
  assert.match(render("codex", false, true), /disabled=""/);
});
