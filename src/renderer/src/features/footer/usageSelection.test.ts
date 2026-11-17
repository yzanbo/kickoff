import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { nextForegroundChat, type ForegroundChat } from "@/features/chat/provider/foregroundChat";
import { activeTemporaryUsage, type TemporaryUsage } from "./usageSelection";
import { UsageProviderPicker } from "./UsageProviderPicker";

test("一時表示は同じチャットを触っても続き、別のチャットに移ると同じ AI でも解除される", () => {
  const initial: ForegroundChat = { provider: null, key: null };
  const chat = nextForegroundChat(initial, "codex", "chat:1");
  const manual: TemporaryUsage = { provider: "claude", foreground: chat };
  assert.equal(activeTemporaryUsage(manual, chat), "claude");
  assert.equal(nextForegroundChat(chat, "codex", "chat:1"), chat);
  assert.equal(activeTemporaryUsage(manual, nextForegroundChat(chat, "codex", "chat:1")), "claude");
  const other = nextForegroundChat(chat, "codex", "chat:2");
  assert.equal(activeTemporaryUsage(manual, other), null);
  // 元のチャットに戻っても以前の一時表示は復活しない。
  assert.equal(activeTemporaryUsage(manual, nextForegroundChat(other, "codex", "chat:1")), null);
});

test("下書きで AI を変える、別の下書きや子チャットに移ると一時表示が解除される", () => {
  const draft = nextForegroundChat({ provider: null, key: null }, "claude", "draft:one");
  const manual: TemporaryUsage = { provider: "codex", foreground: draft };
  assert.equal(activeTemporaryUsage(manual, draft), "codex");
  assert.equal(activeTemporaryUsage(manual, nextForegroundChat(draft, "codex", "draft:one")), null);
  assert.equal(activeTemporaryUsage(manual, nextForegroundChat(draft, "claude", "draft:two")), null);
  assert.equal(activeTemporaryUsage(manual, nextForegroundChat(draft, "claude", "chat:7")), null);
  assert.equal(activeTemporaryUsage(null, draft), null);
});

test("表示先の札は自動・一時表示を見分けられ、メニューを開くボタンになっている", () => {
  const render = (temporary: "claude" | "codex" | null) => renderToStaticMarkup(createElement(UsageProviderPicker, {
    label: "Codex Plus", temporary, onSelect: () => {},
  }));
  const automatic = render(null);
  assert.match(automatic, /aria-haspopup="menu"/);
  assert.match(automatic, /aria-expanded="false"/);
  assert.match(automatic, /チャットに連動/);
  assert.doesNotMatch(automatic, /一時表示/);
  const manual = render("codex");
  assert.match(manual, /Codex Plus/);
  assert.match(manual, /一時表示/);
});
