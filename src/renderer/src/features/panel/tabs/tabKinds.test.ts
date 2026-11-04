import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import type { BucketHead } from "@/features/chatList/buckets";
import { OTHER_CLUSTER } from "@/features/panel/clusters/tabClusters";
import type { PanelTab } from "./panelTypes";
import { browserTab, chatTab, kindOfTab, newChatTab, specOf, subagentTab, tabChat, terminalTab, type ClusterResolver } from "./tabKinds";

const chat = (id: number, extra: Partial<Chat> = {}) => ({ id, project_id: 1, title: `チャット${id}`, ...extra }) as Chat;
const head = (key: string): BucketHead => ({ key, kind: "group", label: key });
const target = { cwd: "/repo/a", label: "a", projectId: 3 };

test("タブのキー: チャット・サブエージェントは中身から決まり（同じものは 1 つのタブ）、新しいチャット・ブラウザ・ターミナルは開くたびに別のキー", () => {
  assert.equal(chatTab(chat(5)).key, chatTab(chat(5)).key);
  assert.equal(subagentTab({ chatId: 5, projectId: 1, toolUseId: "t1", title: "調査" }).key, "subagent:5:t1");
  assert.notEqual(newChatTab({ projectId: 1 }).key, newChatTab({ projectId: 1 }).key);
  assert.notEqual(terminalTab(target).key, terminalTab(target).key);
  // ブラウザも、同じ瞬間に 2 つ開いても重ならない（以前は時刻だけで、続けて開くと同じキーになることがあった）
  assert.notEqual(browserTab().key, browserTab().key);
  // ターミナルはどのプロジェクトの作業場所かも覚える（あとでフォルダから逆算しない）
  assert.equal(terminalTab(target).projectId, 3);
});

test("表示の種類: 新しいチャット・サブエージェントはチャットに入る", () => {
  const tabs: PanelTab[] = [chatTab(chat(1)), newChatTab({ projectId: 1 }), subagentTab({ chatId: 1, projectId: 1, toolUseId: "t", title: "x" }), browserTab(), terminalTab(target)];
  assert.deepEqual(tabs.map(kindOfTab), ["chat", "chat", "chat", "browser", "terminal"]);
});

test("名前: チャットは一覧の最新の名前 → タブが覚えた名前 → 「チャット」、ブラウザはタイトル → ホスト → 「新しいタブ」", () => {
  const t = chatTab({ id: 1, project_id: 1, title: "前の名前" });
  assert.equal(specOf(t).label(t, chat(1, { title: "新しい名前" })), "新しい名前");
  assert.equal(specOf(t).label(t, undefined), "前の名前");
  const blank = chatTab({ id: 2, project_id: 1 });
  assert.equal(specOf(blank).label(blank, undefined), "チャット");
  const page = { ...browserTab("https://example.com/a"), title: "" };
  assert.equal(specOf(page).label(page, undefined), "example.com");
  assert.equal(specOf(browserTab()).label(browserTab(), undefined), "新しいタブ");
  assert.equal(specOf(page).hint?.(page), "https://example.com/a");
});

test("タブのチャット: チャットのタブだけ。一覧にあれば最新のもの、なければタブの中のチャットから届いたもの", () => {
  const listed = chat(1, { title: "一覧" });
  const t: PanelTab = { ...chatTab(chat(1)), chat: chat(1, { title: "タブ" }) };
  assert.equal(tabChat(t, [listed]), listed);
  assert.equal(tabChat(t, [])?.title, "タブ");
  assert.equal(tabChat(browserTab(), [listed]), undefined);
  assert.equal(tabChat(undefined, [listed]), undefined);
});

test("まとまり: チャット・サブエージェントはチャットの（分からなければ作成先の）、新しいチャットは作成先の、ターミナルはフォルダの、ブラウザはその他", () => {
  const resolve: ClusterResolver = {
    chatById: (id) => (id === 1 ? chat(1) : undefined),
    ofChat: (c) => head(`chat:${c.id}`),
    ofTarget: (projectId, group) => head(`target:${projectId}:${group ?? ""}`),
    ofFolder: (projectId, cwd) => head(`folder:${projectId}:${cwd}`),
  };
  const of = (t: PanelTab) => specOf(t).cluster(t, resolve).key;
  assert.equal(of(chatTab(chat(1))), "chat:1");
  assert.equal(of(chatTab(chat(9))), "target:1:");
  assert.equal(of({ ...chatTab(chat(9)), chat: chat(9) }), "chat:9");
  assert.equal(of(subagentTab({ chatId: 1, projectId: 1, toolUseId: "t", title: "x" })), "chat:1");
  assert.equal(of(newChatTab({ projectId: 2, group: 4 })), "target:2:4");
  assert.equal(of(terminalTab(target)), "folder:3:/repo/a");
  assert.equal(specOf(browserTab()).cluster(browserTab(), resolve), OTHER_CLUSTER);
});
