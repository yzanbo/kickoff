import assert from "node:assert/strict";
import { beforeEach, onTestFinished, test, vi } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { publishServerEvent } from "@/foundation/ui/api/events";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { NEW_CHAT_DRAFTS, projectChatOpen } from "@/foundation/ui/storage/storageKeys";
import { activeTabOf } from "@/features/panel/ui/layout/paneTree";
import { readBrowserSession } from "@/features/browser/ui/panel/browserSession";
import { closePane, closeTab, openNewChat, openTab, patchTab, setPanelOpen, showTab, splitPane, togglePanel } from "./actions";
import { browserTab, chatTab, reopenOf, terminalTab } from "@/features/panel/ui/tabs/tabData";
import { currentDrafts, discardDraft, setDraftGroup } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { testTabKind, useTestPanelStore } from "@/features/panel/ui/testing";
import { api } from "@/foundation/ui/api";
import { panelStateOf, startPanelServerEvents, takePanels } from "./panelStore";

const { local } = installMemoryStorage();

// 閉じたターミナルのシェルを止めたか（コアの DELETE /api/terminals/:key の代わり）
const closedShells: string[] = [];
beforeEach(() => {
  vi.stubGlobal("window", { kickoff: { terminal: { owner: async () => "wc:1" } } });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const key = /^\/api\/terminals\/([^/]+)$/.exec(url)?.[1];
    if (init?.method === "DELETE" && key) closedShells.push(decodeURIComponent(key));
    return new Response(null, { status: 204 });
  });
});

const keys = (panel: string) => panelStateOf(panel).tabs.map((t) => t.key);
const target = (projectId: number) => ({ cwd: `/repo/${projectId}`, label: `p${projectId}`, projectId });

/** テストの店（ターミナルは閉じたらシェルを止める = 本物の種類と同じ後始末）。サーバーの知らせも受ける */
function useStore() {
  useTestPanelStore({ kinds: [testTabKind("terminal", { dispose: (t) => void api.closeTerminal(t.key).catch(() => {}) })] });
  onTestFinished(startPanelServerEvents());
}

// 保存（localStorage）はファイルの中で続くので、テストごとに別のプロジェクトの欄を使う

test("チャット欄の開閉は欄の状態 1 つで、プロジェクトごとに覚える（ボードの右のパネルは覚えない）", () => {
  useStore();
  writeSetting(projectChatOpen(1), true);
  assert.equal(panelStateOf("side:1").open, true);
  setPanelOpen("side:1", false);
  assert.equal(panelStateOf("side:1").open, false);
  assert.equal(readSetting(projectChatOpen(1)), false);
  setPanelOpen("kanban:1", true);
  assert.deepEqual(
    [...Array(local.length).keys()].map((i) => local.key(i)),
    ["kickoff:project-chat-open:1"],
  );
});

test("見せている最後のタブを閉じると、フッター・右サイドバーは閉じる（欄の決まりの whenEmpty が close。チャットのパネルの決まりは chatPanel の chatSurfaces.ts）", () => {
  useStore();
  openTab("bottom:2", terminalTab(target(2)));
  assert.equal(panelStateOf("bottom:2").open, true);
  closeTab("bottom:2", keys("bottom:2")[0]);
  assert.equal(panelStateOf("bottom:2").open, false);
  // 右サイドバーはブラウザだけ: 2 つのうち 1 つを閉じても開いたまま、最後の 1 つを閉じたら閉じる（下のパネルの最後のターミナルと同じ）
  openTab("side:2", browserTab("https://a.example"));
  openTab("side:2", browserTab("https://b.example"));
  const [first, second] = keys("side:2");
  closeTab("side:2", first);
  assert.equal(panelStateOf("side:2").open, true);
  closeTab("side:2", second);
  assert.equal(panelStateOf("side:2").open, false);
});

test("右サイドバーのブラウザ: 隠しても開いていたページと選択を復元し、個別に閉じたタブは復元しない", () => {
  useStore();
  const key = "side:31";
  const start = browserTab("https://example.test/start");
  const other = browserTab("https://example.test/other");
  openTab(key, start);
  openTab(key, other);
  const [first, second] = [start.key, other.key];
  patchTab(key, first, { kind: "browser", fields: { current: "https://example.test/next", title: "次のページ" } });
  showTab(key, first);
  setPanelOpen(key, false);
  // メモリの状態を外し、読み込み直したときと同じように保存から作る
  takePanels((panel) => panel === key);
  assert.equal(panelStateOf(key).open, false);
  assert.deepEqual(keys(key), [first, second]);
  assert.equal(activeTabOf(panelStateOf(key).layout), first);
  assert.deepEqual(panelStateOf(key).tabs[0], { kind: "browser", key: first, url: "https://example.test/next", title: "次のページ", restored: true });
  closeTab(key, first);
  assert.deepEqual(readBrowserSession(31)?.tabs.map((t) => t.key), [second]);
  closeTab(key, second);
  assert.equal(readBrowserSession(31), null);
});

test("削除したプロジェクトのブラウザのタブは保存からも外す", () => {
  useStore();
  openTab("side:32", browserTab("https://example.test"));
  takePanels((key) => key === "side:32");
  assert.ok(readBrowserSession(32));
  publishServerEvent({ type: "project_deleted", id: 32 });
  assert.equal(readBrowserSession(32), null);
});

test("閉じたターミナルのタブは、シェルも止める（ペインを閉じたときも）", () => {
  useStore();
  closedShells.length = 0;
  openTab("bottom:3", terminalTab(target(3)));
  openTab("bottom:3", terminalTab(target(3)));
  const [first, second] = keys("bottom:3");
  closeTab("bottom:3", first);
  splitPane("bottom:3", panelStateOf("bottom:3").layout.focused, "row", "after", second);
  closePane("bottom:3", panelStateOf("bottom:3").layout.focused);
  assert.deepEqual(closedShells, [first, second]);
  assert.deepEqual(keys("bottom:3"), []);
});

test("開閉: タブがないまま開くと、右サイドバー（チャット欄）は空のまま開き、フッターはターミナルを始める", () => {
  useStore();
  togglePanel("side:4");
  assert.deepEqual(keys("side:4"), []);
  assert.equal(panelStateOf("side:4").open, true);
  togglePanel("bottom:4", { terminal: target(4) });
  assert.deepEqual(panelStateOf("bottom:4").tabs.map((t) => t.kind), ["terminal"]);
  // タブがあれば、開け閉めするだけ
  togglePanel("bottom:4", { terminal: target(4) });
  togglePanel("bottom:4", { terminal: target(4) });
  assert.equal(panelStateOf("bottom:4").tabs.length, 1);
  assert.equal(panelStateOf("bottom:4").open, true);
});

test("開いているチャットを検索から（focus 付きで）開き直しても、タブを作り直さず、名前とタブの中のチャットは残す", () => {
  useStore();
  openTab("kanban:13", chatTab({ id: 130, project_id: 13, title: "調べもの" }));
  const loaded = makeChat(130, { project_id: 13, title: "調べもの" });
  patchTab("kanban:13", "chat:130", { kind: "chat", fields: { chat: loaded } });
  const again = chatTab({ id: 130, project_id: 13 }, 42);
  openTab("kanban:13", again, reopenOf(again));
  assert.deepEqual(panelStateOf("kanban:13").tabs, [{ key: "chat:130", kind: "chat", id: 130, projectId: 13, title: "調べもの", chat: loaded, focus: 42 }]);
});

test("削除したチャットのタブは、画面に出ていない欄でも閉じる", () => {
  useStore();
  openTab("kanban:6", chatTab({ id: 60, project_id: 6 }));
  openTab("kanban:6", chatTab({ id: 61, project_id: 6 }));
  publishServerEvent({ type: "chat_deleted", id: 60, project_id: 6 });
  assert.deepEqual(keys("kanban:6"), ["chat:61"]);
});

test("下書き: すべての欄の新しいチャットのタブを 1 つの形で出し、グループを変える・消す。再起動しても残すよう保存する", () => {
  useStore();
  openNewChat("kanban:7", { projectId: 7 });
  openNewChat("side:7", { projectId: 7, group: 2 });
  const drafts = currentDrafts().filter((d) => d.projectId === 7);
  assert.deepEqual(
    drafts.map((d) => [d.panel, d.group, d.showing]),
    [
      ["kanban:7", undefined, true],
      ["side:7", 2, true],
    ],
  );
  // 中身が変わらなければ同じ配列
  assert.equal(currentDrafts(), currentDrafts());
  setDraftGroup(drafts[0], 3, "実装");
  assert.equal(currentDrafts().find((d) => d.key === drafts[0].key)?.group, 3);
  assert.deepEqual(Object.keys(readSetting(NEW_CHAT_DRAFTS)).filter((k) => k.endsWith(":7")), ["kanban:7", "side:7"]);
  discardDraft(drafts[1]);
  assert.deepEqual(keys("side:7"), []);
  assert.deepEqual(Object.keys(readSetting(NEW_CHAT_DRAFTS)).filter((k) => k.endsWith(":7")), ["kanban:7"]);
});
