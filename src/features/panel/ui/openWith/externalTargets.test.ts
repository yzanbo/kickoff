import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { browserPageOf, terminalTargetOf } from "./externalTargets";

const targets = [
  { cwd: "/repo/a", label: "a", projectId: 1 },
  { cwd: "/repo/b", label: "b", projectId: 2 },
];
const chatTab: PanelTab = { key: "chat:5", kind: "chat", id: 5, projectId: 2 };
const browser: PanelTab = { key: "browser:x", kind: "browser", url: "https://example.com", title: "", current: "https://example.com/docs" };

test("ターミナルを開く場所: チャットを見せていればその作業場所（ワークツリー → そのプロジェクトの本体）、そうでなければ開く場所が 1 つのときだけ", () => {
  const inWorktree = makeChat(5, { project_id: 2, worktree_path: "/repo/b-worktrees/feat" });
  assert.deepEqual(terminalTargetOf(chatTab, inWorktree, targets), { cwd: "/repo/b-worktrees/feat", label: "feat", projectId: 2 });
  assert.deepEqual(terminalTargetOf(chatTab, makeChat(5, { project_id: 2 }), targets), targets[1]);
  // チャットがまだ届いていなければ、タブのプロジェクトの本体
  assert.deepEqual(terminalTargetOf(chatTab, undefined, targets), targets[1]);
  assert.equal(terminalTargetOf(browser, undefined, targets), undefined);
  assert.deepEqual(terminalTargetOf(browser, undefined, [targets[0]]), targets[0]);
  assert.equal(terminalTargetOf(undefined, undefined, []), undefined);
});

test("外のブラウザで開くページ: 見せているタブがブラウザならそのいまのページ", () => {
  assert.equal(browserPageOf(browser), "https://example.com/docs");
  assert.equal(browserPageOf({ ...browser, current: undefined }), "https://example.com");
  assert.equal(browserPageOf(chatTab), undefined);
});
