import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "./store.js";

function setup() {
  const store = new Store(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "検索", status: "completed", model: null });
  const say = (text: string, type: "user" | "text" = "text", chatId = chat.id) => store.events.add(chatId, { type, text }).id;
  /** 見つかった発言の ID（新しい順） */
  const ids = (query: string, filter?: Parameters<Store["events"]["search"]>[1]) => store.events.search(query, filter).map((h) => h.event_id);
  /** 全文検索の索引が中身（発言の文）と合っているか（合っていなければ例外） */
  const checkIndex = () => store.db.exec("INSERT INTO chat_event_search (chat_event_search) VALUES ('integrity-check')");
  return { store, project, chat, say, ids, checkIndex };
}

test("検索: 日本語は 2 文字（LIKE）でも 3 文字以上（全文検索の索引）でも部分一致で見つかり、切り出しの位置が合う", () => {
  const { say, ids, store } = setup();
  const a = say("日本語の検索ができるようにしたい", "user");
  const b = say("検索の索引は trigram で作ります");
  say("関係のない話");
  assert.deepEqual(ids("検索"), [b, a]);
  assert.deepEqual(ids("日本"), [a]);
  assert.deepEqual(ids("日本語の"), [a]);
  assert.deepEqual(ids("できるように"), [a]);
  assert.deepEqual(ids("の索引は"), [b]);
  assert.deepEqual(ids("見つからない語"), []);
  const [hit] = store.events.search("できるように");
  assert.equal(hit.snippet.slice(hit.match_start, hit.match_end), "できるように");
  assert.equal(hit.type, "user");
});

test("検索: 大文字・小文字を区別せず、% _ \" \\ は文字として探す（短くても長くても）", () => {
  const { say, ids } = setup();
  const oauth = say("ログイン方式は OAuth にしたい");
  const percent = say("100% 終わりました");
  const snake = say("snake_case で書く");
  const camel = say("snakeXcase とは別");
  const quoted = say('"引用" と \\ を含む');
  assert.deepEqual(ids("oauth"), [oauth]);
  assert.deepEqual(ids("OAUTH"), [oauth]);
  assert.deepEqual(ids("oA"), [oauth]);
  assert.deepEqual(ids("0%"), [percent]);
  assert.deepEqual(ids("100%"), [percent]);
  assert.deepEqual(ids("%"), [percent]);
  assert.deepEqual(ids("e_c"), [snake]);
  assert.deepEqual(ids("_c"), [snake]);
  assert.deepEqual(ids("ex"), [camel]);
  assert.deepEqual(ids('"引用"'), [quoted]);
  assert.deepEqual(ids('"'), [quoted]);
  assert.deepEqual(ids("\\"), [quoted]);
  assert.deepEqual(ids("と \\ を"), [quoted]);
});

test("検索: 自分の発言と AI の返答だけを探し、消したチャット・プロジェクトの発言は出ない（索引も追従する）", () => {
  const { store, project, chat, say, ids, checkIndex } = setup();
  store.events.add(chat.id, { type: "tool_use", id: "t1", name: "Read", input: { text: "消える予定の語" } });
  store.events.add(chat.id, { type: "thinking", text: "消える予定の語" });
  const kept = say("消える予定の語（残る）");
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "消す", status: "completed", model: null });
  say("消える予定の語", "user", other.id);
  assert.deepEqual(ids("消える予定"), [kept + 1, kept]);
  store.chats.delete(other.id);
  assert.deepEqual(ids("消える予定"), [kept]);
  assert.deepEqual(ids("消え"), [kept]);
  checkIndex();

  const second = store.projects.create({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const chat2 = store.chats.create({ project_id: second.id, provider: "claude", title: "別", status: "completed", model: null });
  say("別のプロジェクトの発言", "text", chat2.id);
  assert.equal(ids("別のプロジェクト").length, 1);
  assert.deepEqual(ids("別のプロジェクト", { projectId: project.id }), []);
  store.projects.delete(second.id);
  assert.deepEqual(ids("別のプロジェクト"), []);
  checkIndex();

  // 記録を書き換えても索引は追従する（いまは書き換える操作はないが、索引を壊さないように）
  store.db.prepare("UPDATE chat_events SET data = ? WHERE id = ?").run(JSON.stringify({ text: "書き換えた発言" }), kept);
  assert.deepEqual(ids("消える予定"), []);
  assert.deepEqual(ids("書き換えた"), [kept]);
  checkIndex();
});
