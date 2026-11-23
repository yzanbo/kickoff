import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { makeChat } from "@shared/chat/testing";
import { agentTabKey, chatTab, subagentTab } from "@/features/panel/ui";
import { chatTabKind, chatTabLabel, chatTabWorkplace, subagentTabKind } from "./chatTabKinds";

// 中身・見た目・右クリックの部品（会話の画面など）は読まない（名前などの決まりだけを確かめる）
vi.mock("./chatTabPages", () => Object.fromEntries(["ChatTabPage", "NewChatPage", "SubagentPage", "ChildPage", "NewChildPage"].map((name) => [name, () => null])));
vi.mock("./chatTabFaces", () => Object.fromEntries(["ChatTabFace", "NewChatTabFace", "ChildTabFace", "SubagentTabFace"].map((name) => [name, () => null])));
vi.mock("./chatTabMenus", () => Object.fromEntries(["ChatTabMenu", "ChildTabMenu", "NewChatTabMenu"].map((name) => [name, () => null])));

test("名前: チャットは知っているチャットの最新の名前 → タブが覚えた名前 → 「チャット」", () => {
  const t = chatTab({ id: 1, project_id: 1, title: "前の名前" });
  assert.equal(chatTabLabel(t, makeChat(1, { title: "新しい名前" })), "新しい名前");
  assert.equal(chatTabLabel(t, undefined), "前の名前");
  const blank = chatTab({ id: 2, project_id: 1 });
  assert.equal(chatTabLabel(blank, undefined), "チャット");
});

test("サブエージェントのタブ: 同じサブエージェントは 1 つのタブ、名前は開いたときの名前、そのチャットを消したら閉じる", () => {
  const tab = subagentTab({ chatId: 33, agentKey: "toolu_1", title: "調査" });
  assert.equal(tab.key, agentTabKey("toolu_1"));
  assert.equal(subagentTab({ chatId: 33, agentKey: "toolu_1", title: "名前が変わった" }).key, tab.key);
  assert.equal(subagentTabKind.label(tab), "調査");
  assert.equal(subagentTabKind.ownerChatId?.(tab), 33);
  assert.equal(subagentTabKind.projectOf(tab), undefined);
});

test("サブエージェントのタブ: 入れ子のものは名前の前に「↳」、乗せると外側からの道筋。入れ子でなければ名前だけ", () => {
  const nested = subagentTab({ chatId: 33, agentKey: "toolu_2", title: "洗い出し", path: "調査 › 洗い出し" });
  assert.equal(subagentTabKind.label(nested), "↳ 洗い出し");
  assert.equal(subagentTabKind.hint?.(nested), "調査 › 洗い出し");
  const top = subagentTab({ chatId: 33, agentKey: "toolu_1", title: "調査" });
  assert.equal("path" in top, false);
  assert.equal(subagentTabKind.hint?.(top), "調査");
});

test("開き直し: 検索結果から（focus 付きで）開き直したら強調する発言だけ変え、focus がなければそのまま表示する", () => {
  assert.deepEqual(chatTabKind.reopen?.(chatTab({ id: 1, project_id: 1 }, 42)), { kind: "chat", fields: { focus: 42 } });
  assert.equal(chatTabKind.reopen?.(chatTab({ id: 1, project_id: 1 })), undefined);
});

test("作業場所（タブの列からターミナルを開く場所）: チャットのワークツリー → 本体。チャットがまだ届いていなければタブのプロジェクトの本体", () => {
  const t = chatTab({ id: 5, project_id: 2 });
  assert.deepEqual(chatTabWorkplace(t, makeChat(5, { project_id: 2, worktree_path: "/repo/b-worktrees/feat" })), { projectId: 2, worktree: "/repo/b-worktrees/feat" });
  assert.deepEqual(chatTabWorkplace(t, undefined), { projectId: 2, worktree: null });
});
