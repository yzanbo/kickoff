import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { FIRST_PANE, leavesOf, splitPane, type PaneNode } from "@/features/panel/layout/paneLayout";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { emptyPanel, isLinkedTab, panelReducer, type PanelAction, type PanelRules, type PanelState } from "./panelState";

const chat = (id: number) => ({ id, project_id: 1, title: `チャット${id}` }) as Chat;
const chatTab = (id: number): Extract<PanelTab, { kind: "chat" }> => ({ key: `chat:${id}`, kind: "chat", id, projectId: 1, title: `チャット${id}` });
const newTab = (key: string): PanelTab => ({ key, kind: "new", projectId: 1 });
const terminal = (key: string): PanelTab => ({ key, kind: "terminal", cwd: "/tmp", label: "tmp", projectId: 1 });

/** 見せる種類（既定はすべて）と、最後のタブを閉じたら閉じるか */
const rules = (closeWhenEmpty = true, shows: PanelRules["shows"] = () => true): PanelRules => ({ shows, closeWhenEmpty });
const run = (state: PanelState, ...actions: PanelAction[]) => actions.reduce((s, a) => panelReducer(s, a, rules()), state);

/** 木を読みやすい文字列にする（ペインのタブ・表示中のタブ） */
function shape(node: PaneNode): string {
  if (node.type === "pane") return `${node.id}[${node.tabs.map((t) => (t === node.active ? `*${t}` : t)).join(",")}]`;
  return `${node.dir}(${node.children.map(shape).join(" ")})`;
}
const keys = (s: PanelState) => s.tabs.map((t) => t.key);

test("open: なければピントのあるペインに足して表示し、欄も開く。あればそのペインで表示する", () => {
  const s1 = run(emptyPanel(), { type: "open", tab: chatTab(1) }, { type: "open", tab: newTab("new:a") });
  assert.deepEqual(keys(s1), ["chat:1", "new:a"]);
  assert.equal(shape(s1.layout.root), `${FIRST_PANE}[chat:1,*new:a]`);
  assert.equal(s1.open, true);
  const s2 = run({ ...s1, open: false }, { type: "open", tab: chatTab(1) });
  assert.equal(shape(s2.layout.root), `${FIRST_PANE}[*chat:1,new:a]`);
  assert.equal(s2.open, true);
  // もう開いて表示しているなら同じ状態
  assert.equal(run(s2, { type: "open", tab: chatTab(1) }), s2);
});

test("open: 分けたペインにピントがあれば、自分で開くタブはそこへ入る", () => {
  const base = run(emptyPanel(), { type: "open", tab: chatTab(1) }, { type: "open", tab: chatTab(2) });
  const split = run(base, { type: "layout", change: (l) => splitPane(l, FIRST_PANE, "row", "after", "p1", "chat:2") });
  const next = run(split, { type: "open", tab: terminal("terminal:a") });
  assert.equal(shape(next.layout.root), `row(${FIRST_PANE}[*chat:1] p1[chat:2,*terminal:a])`);
});

test("open: もう開いていたタブは中身をそのままにし、reopen の中身だけ変える", () => {
  const loaded: PanelTab = { ...chatTab(1), chat: chat(1) };
  const s1 = run(emptyPanel([loaded]), { type: "open", tab: chatTab(1), reopen: { kind: "chat", fields: { focus: 42 } } });
  assert.deepEqual(s1.tabs[0], { ...loaded, focus: 42 });
});

test("open: サイドバーの一覧にないチャットは閉じるまで残し、表示だけ消していたチャットはまた出す", () => {
  const synced = run(emptyPanel(), { type: "sync", chats: [chat(1)] }, { type: "close", keys: ["chat:1"], dismiss: true });
  assert.deepEqual(synced.links.dismissed, [1]);
  const reopened = run(synced, { type: "open", tab: chatTab(1) }, { type: "open", tab: chatTab(5) });
  assert.deepEqual(reopened.links.dismissed, []);
  assert.deepEqual(reopened.links.extra, [5]);
  assert.ok(isLinkedTab(reopened, "chat:1") && !isLinkedTab(reopened, "chat:5"));
});

test("show: 開いているタブを表示して欄を開く。ないタブなら同じ状態", () => {
  const s = run(emptyPanel([chatTab(1), chatTab(2)]), { type: "show", key: "chat:2" });
  assert.equal(shape(s.layout.root), `${FIRST_PANE}[chat:1,*chat:2]`);
  assert.equal(s.open, true);
  assert.equal(run(s, { type: "show", key: "zzz" }), s);
});

test("patch: その種類のタブの中身だけを変え、変わらなければ同じ状態", () => {
  const s = emptyPanel([newTab("new:a"), chatTab(1)]);
  const s1 = run(s, { type: "patch", key: "new:a", kind: "new", fields: { group: 3, groupName: "実装" } });
  assert.deepEqual(s1.tabs[0], { ...newTab("new:a"), group: 3, groupName: "実装" });
  assert.equal(run(s1, { type: "patch", key: "new:a", kind: "new", fields: { group: 3 } }), s1);
  // 種類の違うタブ・知らないタブは変えない
  assert.equal(run(s1, { type: "patch", key: "chat:1", kind: "new", fields: { group: 1 } }), s1);
  assert.equal(run(s1, { type: "patch", key: "zzz", kind: "chat", fields: { title: "x" } }), s1);
});

test("replace: 送った新しいチャットのタブを、同じペインの同じ位置のまま、できたチャットのタブにする", () => {
  const s = run(emptyPanel([chatTab(1), newTab("new:a")]), { type: "show", key: "new:a" });
  const next = run(s, { type: "replace", key: "new:a", tab: chatTab(9) });
  assert.deepEqual(keys(next), ["chat:1", "chat:9"]);
  assert.equal(shape(next.layout.root), `${FIRST_PANE}[chat:1,*chat:9]`);
});

test("close: 表示中のタブを閉じたら隣のタブへ。見せているタブがなくなったら欄も閉じる（閉じない欄もある）", () => {
  const s = run(emptyPanel([chatTab(1), chatTab(2)]), { type: "show", key: "chat:1" });
  const one = run(s, { type: "close", keys: ["chat:1"], dismiss: true });
  assert.equal(shape(one.layout.root), `${FIRST_PANE}[*chat:2]`);
  assert.equal(one.open, true);
  assert.equal(run(one, { type: "close", keys: ["chat:2"], dismiss: true }).open, false);
  assert.equal(panelReducer(one, { type: "close", keys: ["chat:2"], dismiss: true }, rules(false)).open, true);
  // 隠した種類のタブ（ターミナル）しか残らなければ閉じる
  const hidden = panelReducer(run(emptyPanel([chatTab(1), terminal("terminal:a")]), { type: "show", key: "chat:1" }), { type: "close", keys: ["chat:1"], dismiss: true }, rules(true, (t) => t.kind !== "terminal"));
  assert.deepEqual(keys(hidden), ["terminal:a"]);
  assert.equal(hidden.open, false);
  // 知らないタブなら同じ状態
  assert.equal(run(s, { type: "close", keys: ["zzz"], dismiss: true }), s);
});

test("close: 利用者が閉じたサイドバーのチャットは覚え、アーカイブ・削除のあと（dismiss: false）は覚えない", () => {
  const s = run(emptyPanel(), { type: "sync", chats: [chat(1), chat(2)] });
  assert.deepEqual(run(s, { type: "close", keys: ["chat:1"], dismiss: true }).links.dismissed, [1]);
  assert.deepEqual(run(s, { type: "close", keys: ["chat:1"], dismiss: false }).links.dismissed, []);
  // 表示だけ消したチャットは、連動でまた足さない
  const closed = run(s, { type: "close", keys: ["chat:1"], dismiss: true }, { type: "sync", chats: [chat(1), chat(2)] });
  assert.deepEqual(keys(closed), ["chat:2"]);
});

test("closePane: サイドバーと連動したチャットは一覧のペインへ戻し、ほかのタブは閉じる", () => {
  const s = run(emptyPanel([terminal("terminal:a")]), { type: "sync", chats: [chat(1), chat(2)] });
  const split = run(s, { type: "layout", change: (l) => splitPane(l, FIRST_PANE, "row", "after", "p1", "chat:2") }, { type: "open", tab: terminal("terminal:b") });
  assert.equal(shape(split.layout.root), `row(${FIRST_PANE}[*terminal:a,chat:1] p1[chat:2,*terminal:b])`);
  const closed = run(split, { type: "closePane", paneId: "p1" });
  assert.deepEqual(keys(closed), ["terminal:a", "chat:1", "chat:2"]);
  assert.equal(shape(closed.layout.root), `${FIRST_PANE}[*terminal:a,chat:1,chat:2]`);
  // 最後の 1 つは閉じない
  assert.equal(run(closed, { type: "closePane", paneId: FIRST_PANE }), closed);
});

test("sync: 一覧に入ったチャットは一覧のペインへ（ピントのある分けたペインには足さない）。外れたチャットのタブは閉じる", () => {
  const s = run(emptyPanel([chatTab(1), terminal("terminal:a")]), { type: "sync", chats: [chat(1)] });
  const split = run(s, { type: "layout", change: (l) => splitPane(l, FIRST_PANE, "row", "after", "p1", "terminal:a") });
  assert.equal(split.layout.focused, "p1");
  const added = run(split, { type: "sync", chats: [chat(1), chat(3)] });
  assert.equal(shape(added.layout.root), `row(${FIRST_PANE}[*chat:1,chat:3] p1[*terminal:a])`);
  const removed = run(added, { type: "sync", chats: [chat(3)] });
  assert.deepEqual(keys(removed), ["terminal:a", "chat:3"]);
  assert.equal(leavesOf(removed.layout.root).length, 2);
  // 変わらなければ同じ状態
  assert.equal(run(removed, { type: "sync", chats: [chat(3)] }), removed);
});

test("setOpen: 開く・閉じる（変わらなければ同じ状態）", () => {
  const s = emptyPanel();
  const opened = run(s, { type: "setOpen", open: true });
  assert.equal(opened.open, true);
  assert.equal(run(opened, { type: "setOpen", open: true }), opened);
});
