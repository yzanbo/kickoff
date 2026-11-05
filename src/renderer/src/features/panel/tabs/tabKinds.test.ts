import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat } from "@shared/testing/factories";
import type { BucketHead } from "@/features/chatList/buckets";
import { OTHER_CLUSTER } from "@/features/panel/clusters/tabClusters";
import type { PanelTab } from "./panelTypes";
import { agentTabKey, browserTab, chatTab, kindOfTab, newChatTab, specOf, subagentTab, tabChat, terminalTab, type ClusterResolver } from "./tabKinds";

const head = (key: string): BucketHead => ({ key, kind: "group", label: key });
const target = { cwd: "/repo/a", label: "a", projectId: 3 };

test("タブのキー: チャットは中身から決まり（同じものは 1 つのタブ）、新しいチャット・ブラウザ・ターミナルは開くたびに別のキー", () => {
  assert.equal(chatTab(makeChat(5)).key, chatTab(makeChat(5)).key);
  assert.notEqual(newChatTab({ projectId: 1 }).key, newChatTab({ projectId: 1 }).key);
  assert.notEqual(terminalTab(target).key, terminalTab(target).key);
  // ブラウザも、同じ瞬間に 2 つ開いても重ならない（以前は時刻だけで、続けて開くと同じキーになることがあった）
  assert.notEqual(browserTab().key, browserTab().key);
  // ターミナルはどのプロジェクトの作業場所かも覚える（あとでフォルダから逆算しない）
  assert.equal(terminalTab(target).projectId, 3);
});

test("表示の種類: 新しいチャットはチャットに入る", () => {
  const tabs: PanelTab[] = [chatTab(makeChat(1)), newChatTab({ projectId: 1 }), browserTab(), terminalTab(target)];
  assert.deepEqual(tabs.map(kindOfTab), ["chat", "chat", "browser", "terminal"]);
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

test("まとまり: チャットはチャットの（分からなければ作成先の）、新しいチャットは作成先の、ターミナルはフォルダの、ブラウザはその他", () => {
  const resolve: ClusterResolver = {
    chatById: (id) => (id === 1 ? makeChat(1) : undefined),
    ofChat: (c) => head(`chat:${c.id}`),
    ofTarget: (projectId, group) => head(`target:${projectId}:${group ?? ""}`),
    ofFolder: (projectId, cwd) => head(`folder:${projectId}:${cwd}`),
  };
  const of = (t: PanelTab) => specOf(t).cluster(t, resolve).key;
  assert.equal(of(chatTab(makeChat(1))), "chat:1");
  assert.equal(of(chatTab(makeChat(9))), "target:1:");
  assert.equal(of({ ...chatTab(makeChat(9)), chat: makeChat(9) }), "chat:9");
  assert.equal(of(newChatTab({ projectId: 2, group: 4 })), "target:2:4");
  assert.equal(of(terminalTab(target)), "folder:3:/repo/a");
  assert.equal(specOf(browserTab()).cluster(browserTab(), resolve), OTHER_CLUSTER);
});

test("サブエージェントのタブ: 同じサブエージェントは 1 つのタブ、表示の種類はサブエージェント、名前は開いたときの名前、そのチャットを消したら閉じる", () => {
  const tab = subagentTab({ chatId: 33, agentKey: "toolu_1", title: "調査" });
  assert.equal(tab.key, agentTabKey("toolu_1"));
  assert.equal(subagentTab({ chatId: 33, agentKey: "toolu_1", title: "名前が変わった" }).key, tab.key);
  assert.equal(kindOfTab(tab), "subagent");
  assert.equal(specOf(tab).label(tab, undefined), "調査");
  assert.equal(specOf(tab).chatIdOf?.(tab), 33);
  assert.equal(specOf(tab).projectOf(tab), undefined);
});
