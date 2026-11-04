import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { publishServerEvent } from "@/api/events";
import { installMemoryStorage } from "@/lib/memoryStorage";
import { readSetting, writeSetting } from "@/lib/storage";
import { NEW_CHAT_DRAFTS, panelTabKinds, projectChatOpen } from "@/lib/storageKeys";
import { panelActions } from "./panelActions";
import { currentDrafts, discardDraft, setDraftGroup } from "./panelDrafts";
import { panelStateOf } from "./panelStore";

const { local } = installMemoryStorage();
beforeEach(() => local.clear());

// 閉じたターミナルのシェルを止めたか（メインプロセスの代わり）
const closedShells: string[] = [];
Object.defineProperty(globalThis, "window", {
  value: { kickoff: { terminal: { close: async (key: string) => void closedShells.push(key) } } },
  configurable: true,
  writable: true,
});

const keys = (panel: string) => panelStateOf(panel).tabs.map((t) => t.key);
const target = (projectId: number) => ({ cwd: `/repo/${projectId}`, label: `p${projectId}`, projectId });

// 欄の状態はモジュールで覚えるので、テストごとに別のプロジェクトの欄を使う

test("チャット欄の開閉は欄の状態 1 つで、プロジェクトごとに覚える（ボードの右のパネルは覚えない）", () => {
  writeSetting(projectChatOpen(1), true);
  assert.equal(panelStateOf("side:1").open, true);
  panelActions("side:1").close();
  assert.equal(panelStateOf("side:1").open, false);
  assert.equal(readSetting(projectChatOpen(1)), false);
  panelActions("kanban:1").setOpen(true);
  assert.deepEqual(
    [...Array(local.length).keys()].map((i) => local.key(i)),
    ["kickoff:project-chat-open:1"],
  );
});

test("見せている最後のタブを閉じると、ボードの右のパネル・フッターは閉じ、チャット欄は開いたまま", () => {
  for (const [panel, open] of [["kanban:2", false], ["bottom:2", false], ["side:2", true]] as const) {
    const actions = panelActions(panel);
    actions.openTerminal(target(2));
    assert.equal(panelStateOf(panel).open, true);
    actions.closeTab(keys(panel)[0]);
    assert.equal(panelStateOf(panel).open, open, panel);
  }
});

test("閉じたターミナルのタブは、シェルも止める（ペインを閉じたときも）", () => {
  closedShells.length = 0;
  const actions = panelActions("bottom:3");
  actions.openTerminal(target(3));
  actions.openTerminal(target(3));
  const [first, second] = keys("bottom:3");
  actions.closeTab(first);
  actions.splitPane(panelStateOf("bottom:3").layout.focused, "row", "after", second);
  actions.closePane(panelStateOf("bottom:3").layout.focused);
  assert.deepEqual(closedShells, [first, second]);
  assert.deepEqual(keys("bottom:3"), []);
});

test("開閉: 見せるタブがないまま開くと、チャット欄はチャットを出す欄なら新しいチャット、フッターはターミナルを始める", () => {
  panelActions("side:4").toggle();
  assert.deepEqual(keys("side:4"), []);
  assert.equal(panelStateOf("side:4").open, true);
  panelActions("side:4").toggle();
  writeSetting(panelTabKinds("side"), ["chat", "browser"]);
  panelActions("side:4").toggle();
  assert.deepEqual(panelStateOf("side:4").tabs.map((t) => [t.kind, "projectId" in t && t.projectId]), [["new", 4]]);
  panelActions("bottom:4").toggle({ terminal: target(4) });
  assert.deepEqual(panelStateOf("bottom:4").tabs.map((t) => t.kind), ["terminal"]);
  // 見せるタブがあれば、開け閉めするだけ
  panelActions("bottom:4").toggle({ terminal: target(4) });
  panelActions("bottom:4").toggle({ terminal: target(4) });
  assert.equal(panelStateOf("bottom:4").tabs.length, 1);
  assert.equal(panelStateOf("bottom:4").open, true);
});

test("隠している種類のタブを自分で開いたら、その種類を出す", () => {
  writeSetting(panelTabKinds("board"), ["chat"]);
  panelActions("kanban:5").openBrowser("https://example.com");
  assert.deepEqual(readSetting(panelTabKinds("board")), ["chat", "browser"]);
});

test("削除したチャットのタブは、画面に出ていない欄でも閉じる（そのチャットのサブエージェントのタブも）", () => {
  const actions = panelActions("kanban:6");
  actions.open({ id: 60, project_id: 6 });
  actions.openSubagent({ chatId: 60, projectId: 6, toolUseId: "t1", title: "調査" });
  actions.open({ id: 61, project_id: 6 });
  publishServerEvent({ type: "chat_deleted", id: 60, project_id: 6 });
  assert.deepEqual(keys("kanban:6"), ["chat:61"]);
});

test("下書き: すべての欄の新しいチャットのタブを 1 つの形で出し、グループを変える・消す。再起動しても残すよう保存する", () => {
  panelActions("kanban:7").openNew({ projectId: 7 });
  panelActions("side:7").openNew({ projectId: 7, group: 2 });
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
