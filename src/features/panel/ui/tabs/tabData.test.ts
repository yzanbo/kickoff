import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { tabChat } from "@/features/panel/ui/usePanel";
import type { PanelTab } from "./panelTypes";
import { browserTab, chatTab, newChatTab, newTabKey, terminalTab } from "./tabData";
import { repointedAt } from "@/features/panel/ui/kind";

const target = { cwd: "/repo/a", label: "a", projectId: 3 };

test("タブのキー: チャットは中身から決まり（同じものは 1 つのタブ）、新しいチャットは下書きのキー、ブラウザ・ターミナルは開くたびに別のキー", () => {
  assert.equal(chatTab(makeChat(5)).key, chatTab(makeChat(5)).key);
  assert.notEqual(newTabKey("new"), newTabKey("new"));
  assert.equal(newChatTab("new:1").key, "new:1");
  assert.notEqual(terminalTab(target).key, terminalTab(target).key);
  // ブラウザも、同じ瞬間に 2 つ開いても重ならない（時刻だけのキーだと、続けて開くと同じキーになる）
  assert.notEqual(browserTab().key, browserTab().key);
  // ターミナルはどのプロジェクトの作業場所かも覚える（あとでフォルダから逆算しない）
  assert.equal(terminalTab(target).projectId, 3);
});

test("タブのチャット: チャットのタブだけ。一覧にあれば最新のもの、なければタブの中のチャットから届いたもの", () => {
  const listed = makeChat(1, { title: "一覧" });
  const t: PanelTab = { ...chatTab(makeChat(1)), chat: makeChat(1, { title: "タブ" }) };
  assert.equal(tabChat(t, [listed]), listed);
  assert.equal(tabChat(t, [])?.title, "タブ");
  assert.equal(tabChat(browserTab(), [listed]), undefined);
  assert.equal(tabChat(undefined, [listed]), undefined);
});

test("repointedAt: 移す前の作業場所（同じチャット・プロジェクト・ワークツリー）のタブだけ、新しい作業場所の値を返す", () => {
  const move = { chatId: 1, from: { projectId: 7, worktree: null }, to: { projectId: 7, worktree: "/wt/feat" } };
  assert.deepEqual(repointedAt({ chatId: 1, projectId: 7 }, move), { chatId: 1, projectId: 7, worktree: "/wt/feat" });
  assert.deepEqual(repointedAt({ chatId: 1, projectId: 7, worktree: "/wt/feat" }, { ...move, from: move.to, to: move.from }), { chatId: 1, projectId: 7 });
  assert.equal(repointedAt({ chatId: 1, projectId: 7, worktree: "/wt/other" }, move), null);
  assert.equal(repointedAt({ chatId: 2, projectId: 7 }, move), null);
  assert.equal(repointedAt({ chatId: 1, projectId: 8 }, move), null);
});
