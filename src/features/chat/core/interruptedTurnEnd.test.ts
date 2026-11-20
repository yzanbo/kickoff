import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { collectSubagents } from "@shared/chat/subagents";
import { endInterruptedTurns, stoppedSubagentsNotice } from "./interruptedTurnEnd";

function setup() {
  const store = testStore(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chat = (title: string, status: "running" | "cancelled") => store.chats.create({ project_id: project.id, provider: "claude", title, status, model: null });
  const say = (chatId: number, text: string) => store.events.add(chatId, { type: "user", text, message_uuid: crypto.randomUUID() });
  return { store, chat, say };
}

test("起動のとき: 途中で止まった印のあるチャットの、終わりのない最後の作業に終わりの記録と止まったサブエージェントのお知らせを足す", () => {
  const { store, chat, say } = setup();
  // 落ちた（作業中のまま残った）チャット: 前の作業は終わっていて、いまの作業の途中で止まった
  const crashed = chat("落ちた", "running");
  say(crashed.id, "前の作業");
  store.events.add(crashed.id, { type: "tool_use", id: "old", name: "Agent", input: { description: "前の作業の分" } });
  store.events.add(crashed.id, { type: "subagent", task_id: "a-old", tool_use_id: "old", description: "前の作業の分", status: "completed" });
  store.events.add(crashed.id, { type: "result", status: "completed", text: "済み" });
  say(crashed.id, "0023 の残りを");
  store.events.add(crashed.id, { type: "tool_use", id: "tu", name: "Agent", input: { description: "0023 の残りを実装する" } });
  store.events.add(crashed.id, { type: "subagent", task_id: "a1", tool_use_id: "tu", description: "0023 の残りを実装する", status: "running" });
  // 途中で伝えた発言のあとも、同じ作業の分
  say(crashed.id, "伝えた");
  // 終えるときに印を付けた（中断で終わったが、終わりの記録は書けなかった）チャット
  const quit = chat("終えた", "cancelled");
  say(quit.id, "作業");
  store.chats.setResumePending([quit.id], true);

  const recovered = store.chats.recoverInterrupted("アプリの終了により中断しました。");
  assert.deepEqual(recovered, [crashed.id, quit.id]);
  assert.deepEqual(endInterruptedTurns(store, recovered), [crashed.id, quit.id]);

  const [notice, end] = store.events.list(crashed.id).slice(-2);
  assert.deepEqual(notice.type === "notice" ? notice.data.message : null, stoppedSubagentsNotice(["0023 の残りを実装する"]));
  assert.deepEqual(end.type === "result" ? [end.data.status, end.data.text] : null, ["failed", "アプリの終了により中断しました。"]);
  const quitEnd = store.events.list(quit.id).at(-1)!;
  assert.deepEqual(quitEnd.type === "result" ? [quitEnd.data.status, quitEnd.data.text] : null, ["cancelled", undefined]);
  // 次の作業が始まっても、止まったサブエージェントは動いているとみなさない
  say(crashed.id, "次の作業");
  const row = collectSubagents(store.events.list(crashed.id), {}, true).find((s) => s.key === "tu")!;
  assert.equal(row.status, "stopped");
});

test("起動のとき: もう終わりの記録がある・印のない・発言のないチャットには足さず、起動し直しても 2 回は足さない", () => {
  const { store, chat, say } = setup();
  // 通信の切断でつながるのを待っていた（終わりの記録はある）
  const waiting = chat("待っていた", "cancelled");
  say(waiting.id, "作業");
  store.events.add(waiting.id, { type: "result", status: "failed", text: "API Error: Connection error.", network: true });
  // 印のないチャット（終わりの記録がなくても触らない）
  const other = chat("ほか", "cancelled");
  say(other.id, "作業");
  // 発言のない（引き継いで開いただけの）子チャット
  const opened = chat("開いただけ", "cancelled");
  store.events.add(opened.id, { type: "notice", message: "親の会話を引き継ぎました" });
  const crashed = chat("落ちた", "running");
  say(crashed.id, "作業");
  store.chats.setResumePending([waiting.id, opened.id], true);

  const first = store.chats.recoverInterrupted("中断しました");
  assert.deepEqual(endInterruptedTurns(store, first), [crashed.id]);
  const count = (id: number) => store.events.list(id).filter((e) => e.type === "result").length;
  assert.deepEqual([count(waiting.id), count(other.id), count(opened.id), count(crashed.id)], [1, 0, 0, 1]);
  // 起動し直した（答えなかったので印は残る）
  assert.deepEqual(endInterruptedTurns(store, store.chats.recoverInterrupted("中断しました")), []);
  assert.equal(count(crashed.id), 1);
  // サブエージェントのない作業には、お知らせを足さない
  assert.equal(store.events.list(crashed.id).some((e) => e.type === "notice"), false);
});
