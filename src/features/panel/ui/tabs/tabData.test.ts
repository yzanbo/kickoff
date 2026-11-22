import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { tabChat } from "@/features/panel/ui/usePanel";
import type { PanelTab } from "./panelTypes";
import { browserTab, chatTab, newChatTab, newTabKey, terminalTab } from "./tabData";

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
