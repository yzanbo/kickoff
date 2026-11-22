import assert from "node:assert/strict";
import { test } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { activeTabOf } from "@/features/panel/ui/layout/paneTree";
import { browserTab, noteTab } from "@/features/panel/ui/tabs/tabData";
import { useTestPanelStore } from "@/features/panel/ui/testing";
import { mapTabs, openInFocusedPane, openTab } from "./actions";
import { panelStateOf } from "./panelStore";

installMemoryStorage();

const note = (path: string, chatId: number | null = null) => noteTab({ chatId, projectId: 1, path });
const keys = (panel: string) => panelStateOf(panel).tabs.map((t) => t.key);
const shown = (panel: string) => activeTabOf(panelStateOf(panel).layout);

test("openInFocusedPane: 開いていれば表示、newTab なら足し、ふだんは表示中の同じ種類のタブを入れ替える（確かめて断られたらやめる）", async () => {
  useTestPanelStore();
  const panel = "notes:1";
  await openInFocusedPane(panel, note("a.md"), { newTab: false });
  await openInFocusedPane(panel, note("b.md"), { newTab: false });
  assert.deepEqual(keys(panel), [note("b.md").key]);
  await openInFocusedPane(panel, note("c.md"), { newTab: true });
  assert.deepEqual(keys(panel), [note("b.md").key, note("c.md").key]);
  await openInFocusedPane(panel, note("b.md"), { newTab: false });
  assert.equal(shown(panel), note("b.md").key);
  await openInFocusedPane(panel, note("d.md"), { newTab: false, confirmReplace: async () => false });
  assert.deepEqual(keys(panel), [note("b.md").key, note("c.md").key]);
  // 表示中が同じ種類でなければ新しいタブ
  openTab(panel, browserTab("https://example.test"));
  await openInFocusedPane(panel, note("e.md"), { newTab: false });
  assert.equal(keys(panel).length, 4);
});

test("mapTabs: その種類のタブだけを、渡した欄で付け替える・閉じる（ほかの欄・ほかの種類は触らない）", () => {
  useTestPanelStore();
  openTab("notes:1", note("a.md"));
  openTab("notes:1", note("b.md"));
  openTab("notes:1", browserTab("https://example.test"));
  openTab("agents:5", note("a.md", 5));
  mapTabs("note", (t) => (t.path === "a.md" ? note("x.md", t.chatId) : t.path === "b.md" ? null : t), ["notes:1"]);
  assert.deepEqual(panelStateOf("notes:1").tabs.map((t) => (t.kind === "note" ? t.path : t.kind)), ["x.md", "browser"]);
  assert.deepEqual(keys("agents:5"), [note("a.md", 5).key]);
  mapTabs("note", (t) => note("y.md", t.chatId));
  assert.deepEqual(keys("agents:5"), [note("y.md", 5).key]);
});
