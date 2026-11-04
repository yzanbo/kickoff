import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { shownActiveOf } from "@/features/panel/state/panelKinds";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { browserPageOf, terminalTargetOf } from "./openTargets";

const targets = [
  { cwd: "/repo/a", label: "a", projectId: 1 },
  { cwd: "/repo/b", label: "b", projectId: 2 },
];
const chatTab: PanelTab = { key: "chat:5", kind: "chat", id: 5, projectId: 2 };
const browser: PanelTab = { key: "browser:x", kind: "browser", url: "https://example.com", title: "", current: "https://example.com/docs" };
const terminal: PanelTab = { key: "terminal:x", kind: "terminal", cwd: "/repo/a", label: "a", projectId: 1 };

test("ターミナルを開く場所: チャットを見せていればその作業場所（ワークツリー → そのプロジェクトの本体）、そうでなければ開く場所が 1 つのときだけ", () => {
  const inWorktree = { id: 5, project_id: 2, worktree_path: "/repo/b-worktrees/feat" } as Chat;
  assert.deepEqual(terminalTargetOf(chatTab, inWorktree, targets), { cwd: "/repo/b-worktrees/feat", label: "feat", projectId: 2 });
  assert.deepEqual(terminalTargetOf(chatTab, { id: 5, project_id: 2, worktree_path: null } as Chat, targets), targets[1]);
  // チャットがまだ届いていなければ、タブのプロジェクトの本体
  assert.deepEqual(terminalTargetOf(chatTab, undefined, targets), targets[1]);
  assert.equal(terminalTargetOf(browser, undefined, targets), undefined);
  assert.deepEqual(terminalTargetOf(browser, undefined, [targets[0]]), targets[0]);
  assert.equal(terminalTargetOf(undefined, undefined, []), undefined);
});

test("外のブラウザで開くページ: 見せているタブがブラウザならそのいまのページ。隠した種類のタブが表示中でも、見せているブラウザのタブのページ", () => {
  assert.equal(browserPageOf(browser), "https://example.com/docs");
  assert.equal(browserPageOf({ ...browser, current: undefined }), "https://example.com");
  assert.equal(browserPageOf(chatTab), undefined);
  // ターミナルを隠していて、ペインの表示中のタブがターミナルのまま（以前はこの表示中のタブを見て、ページなしで開いていた）
  const tabs = [terminal, browser];
  const pane = { type: "pane" as const, id: "p", tabs: tabs.map((t) => t.key), active: terminal.key };
  const shown = tabs.find((t) => t.key === shownActiveOf(pane, (key) => !key.startsWith("terminal:")));
  assert.equal(browserPageOf(shown), "https://example.com/docs");
});
