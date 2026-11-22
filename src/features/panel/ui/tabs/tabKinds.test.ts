import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { tabChat } from "@/features/panel/ui/usePanel";
import type { PanelTab } from "./panelTypes";
import { agentTabKey, browserTab, chatTab, newChatTab, subagentTab, terminalTab } from "./tabData";
import { PANEL_TAB_KINDS } from "./tabKinds";

// 中身の部品（会話の画面・ブラウザなど）は読まない（名前などの決まりだけを確かめる）
vi.mock("./PanelTabPage", () => {
  const pages = ["ChatTabPage", "NewChatPage", "SubagentPage", "ChangesPage", "ProjectViewPage", "FilePage", "ProjectFilePage", "NotePage", "DatabasePage", "GitHubPage", "CiPage", "DockerPage", "TrashPage", "ChildPage", "NewChildPage", "BrowserPage", "TerminalPage"];
  return Object.fromEntries(pages.map((name) => [name, () => null]));
});

/** 種類の決まり（登録の表から引く） */
const specOf = (tab: PanelTab) => PANEL_TAB_KINDS.find((k) => k.is(tab))!;
const target = { cwd: "/repo/a", label: "a", projectId: 3 };

test("タブのキー: チャットは中身から決まり（同じものは 1 つのタブ）、新しいチャット・ブラウザ・ターミナルは開くたびに別のキー", () => {
  assert.equal(chatTab(makeChat(5)).key, chatTab(makeChat(5)).key);
  assert.notEqual(newChatTab({ projectId: 1 }).key, newChatTab({ projectId: 1 }).key);
  assert.notEqual(terminalTab(target).key, terminalTab(target).key);
  // ブラウザも、同じ瞬間に 2 つ開いても重ならない（時刻だけのキーだと、続けて開くと同じキーになる）
  assert.notEqual(browserTab().key, browserTab().key);
  // ターミナルはどのプロジェクトの作業場所かも覚える（あとでフォルダから逆算しない）
  assert.equal(terminalTab(target).projectId, 3);
});

test("名前: チャットは一覧の最新の名前 → タブが覚えた名前 → 「チャット」、ブラウザはタイトル → ホスト → 「新しいタブ」", () => {
  const t = chatTab({ id: 1, project_id: 1, title: "前の名前" });
  assert.equal(specOf(t).label(t, makeChat(1, { title: "新しい名前" })), "新しい名前");
  assert.equal(specOf(t).label(t, undefined), "前の名前");
  const blank = chatTab({ id: 2, project_id: 1 });
  assert.equal(specOf(blank).label(blank, undefined), "チャット");
  const page = { ...browserTab("https://example.com/a"), title: "" };
  assert.equal(specOf(page).label(page, undefined), "example.com");
  assert.equal(specOf(browserTab()).label(browserTab(), undefined), "新しいタブ");
  assert.equal(specOf(page).hint?.(page), "https://example.com/a");
});

test("タブのチャット: チャットのタブだけ。一覧にあれば最新のもの、なければタブの中のチャットから届いたもの", () => {
  const listed = makeChat(1, { title: "一覧" });
  const t: PanelTab = { ...chatTab(makeChat(1)), chat: makeChat(1, { title: "タブ" }) };
  assert.equal(tabChat(t, [listed]), listed);
  assert.equal(tabChat(t, [])?.title, "タブ");
  assert.equal(tabChat(browserTab(), [listed]), undefined);
  assert.equal(tabChat(undefined, [listed]), undefined);
});

test("サブエージェントのタブ: 同じサブエージェントは 1 つのタブ、名前は開いたときの名前、そのチャットを消したら閉じる", () => {
  const tab = subagentTab({ chatId: 33, agentKey: "toolu_1", title: "調査" });
  assert.equal(tab.key, agentTabKey("toolu_1"));
  assert.equal(subagentTab({ chatId: 33, agentKey: "toolu_1", title: "名前が変わった" }).key, tab.key);
  assert.equal(specOf(tab).label(tab, undefined), "調査");
  assert.equal(specOf(tab).ownerChatId?.(tab), 33);
  assert.equal(specOf(tab).projectOf(tab), undefined);
});

test("サブエージェントのタブ: 入れ子のものは名前の前に「↳」、乗せると外側からの道筋。入れ子でなければ名前だけ", () => {
  const nested = subagentTab({ chatId: 33, agentKey: "toolu_2", title: "洗い出し", path: "調査 › 洗い出し" });
  assert.equal(specOf(nested).label(nested, undefined), "↳ 洗い出し");
  assert.equal(specOf(nested).hint?.(nested), "調査 › 洗い出し");
  const top = subagentTab({ chatId: 33, agentKey: "toolu_1", title: "調査" });
  assert.equal("path" in top, false);
  assert.equal(specOf(top).hint?.(top), "調査");
});
