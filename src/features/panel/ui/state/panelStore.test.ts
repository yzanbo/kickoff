import assert from "node:assert/strict";
import { beforeEach, onTestFinished, test, vi } from "vitest";
import { publishServerEvent } from "@/foundation/ui/api/events";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { projectChatOpen } from "@/foundation/ui/storage/storageKeys";
import { closePane, closeTab, openTab, patchTab, setPanelOpen, splitPane, togglePanel } from "./actions";
import { browserTab, chatTab, terminalTab } from "@/features/panel/ui/tabs/tabData";
import { testTabKind, useTestPanelStore } from "@/features/panel/ui/testing";
import { panelStateOf, startPanelServerEvents } from "./panelStore";

const { local } = installMemoryStorage();

// 閉じたターミナルのシェルを止めたか（本物の種類はコアの DELETE /api/terminals/:key を呼ぶ）
const closedShells: string[] = [];
beforeEach(() => {
  vi.stubGlobal("window", { kickoff: { terminal: { owner: async () => "wc:1" } } });
});

const keys = (panel: string) => panelStateOf(panel).tabs.map((t) => t.key);
const target = (projectId: number) => ({ cwd: `/repo/${projectId}`, label: `p${projectId}`, projectId });

/** テストの店（ターミナルは閉じたらシェルを止める = 本物の種類と同じ後始末）。サーバーの知らせも受ける */
function useStore() {
  useTestPanelStore({ kinds: [testTabKind("terminal", { dispose: (t) => void closedShells.push(t.key) })] });
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

test("開閉: タブがないまま開くと、右サイドバー（チャット欄）は空のまま開き、フッターは殻が渡したターミナルを始める", () => {
  useStore();
  togglePanel("side:4");
  assert.deepEqual(keys("side:4"), []);
  assert.equal(panelStateOf("side:4").open, true);
  togglePanel("bottom:4", { emptyTab: terminalTab(target(4)) });
  assert.deepEqual(panelStateOf("bottom:4").tabs.map((t) => t.kind), ["terminal"]);
  // タブがあれば、開け閉めするだけ
  togglePanel("bottom:4", { emptyTab: terminalTab(target(4)) });
  togglePanel("bottom:4", { emptyTab: terminalTab(target(4)) });
  assert.equal(panelStateOf("bottom:4").tabs.length, 1);
  assert.equal(panelStateOf("bottom:4").open, true);
});

test("開いているチャットを検索から（focus 付きで）開き直しても、タブを作り直さず、読み込んだときに入れた名前は残す", () => {
  useStore();
  openTab("kanban:13", chatTab({ id: 130, project_id: 13 }));
  patchTab("kanban:13", "chat:130", { kind: "chat", fields: { title: "調べもの" } });
  const again = chatTab({ id: 130, project_id: 13 }, 42);
  openTab("kanban:13", again, { kind: "chat", fields: { focus: 42 } });
  assert.deepEqual(panelStateOf("kanban:13").tabs, [{ key: "chat:130", kind: "chat", id: 130, projectId: 13, title: "調べもの", focus: 42 }]);
});

test("削除したチャットのタブは、画面に出ていない欄でも閉じる", () => {
  useStore();
  openTab("kanban:6", chatTab({ id: 60, project_id: 6 }));
  openTab("kanban:6", chatTab({ id: 61, project_id: 6 }));
  publishServerEvent({ type: "chat_deleted", id: 60, project_id: 6 });
  assert.deepEqual(keys("kanban:6"), ["chat:61"]);
});
