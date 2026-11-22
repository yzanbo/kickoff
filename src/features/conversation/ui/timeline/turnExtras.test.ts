import assert from "node:assert/strict";
import { test } from "vitest";
import { eventSequence, makeEvent } from "@shared/foundation/testing/factories";
import { AI_CREATE_CHAT_TOOL, createdChatMark } from "@shared/chat/aiCreateChat";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import { groupEvents } from "./timelineItems";
import { createdChatsByUser, turnExtrasOf } from "./turnExtras";

test("turnExtrasOf: 作業の終わり（result）に、その作業を始めた自分の発言の時刻と返答の文を付ける", () => {
  const extras = turnExtrasOf([
    makeEvent(1, "user", { text: "1 回目" }, { created_at: "2026-11-01T00:00:00Z" }),
    makeEvent(10, "text", { text: "答え 1" }, { created_at: "2026-11-01T00:00:30Z" }),
    makeEvent(11, "text", { text: "サブ", parent: "x" }, { created_at: "2026-11-01T00:00:40Z" }),
    makeEvent(12, "text", { text: "答え 2" }, { created_at: "2026-11-01T00:00:50Z" }),
    makeEvent(2, "result", { status: "completed" }, { created_at: "2026-11-01T00:01:23Z" }),
    makeEvent(3, "user", { text: "2 回目" }, { created_at: "2026-11-01T00:05:00Z" }),
    makeEvent(4, "user", { text: "追加" }, { created_at: "2026-11-01T00:05:10Z" }),
    makeEvent(5, "result", { status: "cancelled" }, { created_at: "2026-11-01T00:06:00Z" }),
    makeEvent(6, "result", { status: "completed" }, { created_at: "2026-11-01T00:07:00Z" }),
  ]);
  // 続けて送ったときは最初の発言から数え、発言のない result には付けない
  assert.deepEqual([2, 5, 6].map((id) => extras.get(id)?.start), ["2026-11-01T00:00:00Z", "2026-11-01T00:05:00Z", undefined]);
  // コピーする返答は、その作業での AI の返答だけ（サブエージェントの発言は含めない）
  assert.deepEqual([2, 5, 6].map((id) => extras.get(id)?.text), ["答え 1\n\n答え 2", undefined, undefined]);
});

test("turnExtrasOf: 作業の終わりに、親チャットに渡す最後の返答と、依頼文を頼んだ作業かを付ける（返答がなければ付けない・前の回の答えを渡せば同じもの）", () => {
  const events = [
    makeEvent(1, "user", { text: "依頼文を", handoff_request: true }),
    makeEvent(2, "text", { text: "確認します" }),
    makeEvent(3, "tool_use", { id: "r1", name: "Read", input: {} }),
    makeEvent(4, "tool_result", { tool_use_id: "r1", content: "…" }),
    makeEvent(5, "text", { text: "依頼文の本文" }),
    makeEvent(6, "result", { status: "completed" }),
    makeEvent(7, "user", { text: "ふつうの質問" }),
    makeEvent(8, "text", { text: "答え" }),
    makeEvent(9, "result", { status: "completed" }),
    makeEvent(10, "user", { text: "返答なし" }),
    makeEvent(11, "result", { status: "cancelled" }),
  ];
  const first = turnExtrasOf(events);
  assert.deepEqual([6, 9, 11].map((id) => first.get(id)?.handoff), [{ reply: "依頼文の本文", requested: true }, { reply: "答え", requested: false }, undefined]);
  // 組み立て直しても同じもの（memo した終わりの行を描き直させない）
  const again = turnExtrasOf(events, { prev: first });
  assert.equal(again.get(6), first.get(6));
});

test("turnExtrasOf: 親チャットに渡した記録を、渡した作業の終わりに渡した順で付ける（増えるまでは同じ配列）", () => {
  const events = [
    makeEvent(1, "user", { text: "依頼文を" }),
    makeEvent(2, "text", { text: "本文" }),
    makeEvent(3, "result", { status: "completed" }),
    makeEvent(4, "user", { text: "次" }),
    makeEvent(5, "text", { text: "答え" }),
    makeEvent(6, "result", { status: "completed" }),
    makeEvent(7, "handoff", { via: "composer", parent_chat_id: 9, turn_event_id: 3 }),
    makeEvent(8, "handoff", { via: "send", parent_chat_id: 9, turn_event_id: 3 }),
  ];
  // 流れには出さない
  assert.ok(groupEvents(events).every((i) => i.kind !== "event" || i.event.type !== "handoff"));
  const first = turnExtrasOf(events);
  assert.deepEqual(first.get(3)?.handoffs?.map((e) => e.data.via), ["composer", "send"]);
  assert.equal(first.get(6)?.handoffs, undefined);
  assert.equal(turnExtrasOf(events, { prev: first }).get(3), first.get(3));
  const more = [...events, makeEvent(9, "handoff", { via: "queue", parent_chat_id: 9, turn_event_id: 3 })];
  const next = turnExtrasOf(more, { prev: first });
  assert.deepEqual(next.get(3)?.handoffs?.map((e) => e.data.via), ["composer", "send", "queue"]);
  // 渡した記録が増えても、ほかの付け足しは前の物のまま
  assert.equal(next.get(3)?.handoff, first.get(3)?.handoff);
  assert.equal(next.get(6), first.get(6));
});

test("turnExtrasOf: 頭を読んでいない最初の作業の終わりには付けない（次の作業からは付ける）", () => {
  const events = [makeEvent(1, "text", { text: "途中から" }), makeEvent(2, "result", { status: "completed" }), makeEvent(3, "user", { text: "次" }), makeEvent(4, "text", { text: "答え" }), makeEvent(5, "result", { status: "completed" })];
  const extras = turnExtrasOf(events, { partialHead: true });
  assert.equal(extras.has(2), false);
  assert.equal(extras.get(5)?.text, "答え");
});

test("turnExtrasOf: 作業の終わりに、その作業で変えたファイルを付ける（サブエージェントの変更も含める）", () => {
  const ev = eventSequence();
  const call = (key: string, name: string, input: object, result: { content: string }, parent?: string) => [
    ev("tool_use", { id: key, name, input, ...(parent ? { parent } : {}) }),
    ev("tool_result", { tool_use_id: key, is_error: false, ...result, ...(parent ? { parent } : {}) }),
  ];
  const events = [
    ev("user", { text: "直して" }),
    ...call("e1", "Edit", { file_path: "/r/a.ts", old_string: "x", new_string: "y" }, { content: "ok" }),
    ...call("s1", "Write", { file_path: "/r/sub.ts", content: "a" }, { content: "File created successfully" }, "agent1"),
    ev("result", { status: "completed" }),
    ev("user", { text: "質問だけ" }),
    ev("text", { text: "答え" }),
    ev("result", { status: "completed" }),
  ];
  const ends = events.filter((e) => e.type === "result");
  const extras = turnExtrasOf(events);
  assert.deepEqual(
    ends.map((e) => extras.get(e.id)?.changes?.map((f) => f.path)),
    [["/r/a.ts", "/r/sub.ts"], undefined],
  );
});

test("createdChatsByUser: 発言の作業で create_chat が作った兄弟・親のないチャットを、その発言に付ける（子チャット・失敗・サブエージェントの中は付けない）", () => {
  const ev = eventSequence();
  const first = ev("user", { text: "作って", message_uuid: "u1" });
  const events = [
    first,
    ev("tool_use", { id: "c1", name: AI_CREATE_CHAT_TOOL, input: { relation: "root", text: "x" } }),
    ev("tool_result", { tool_use_id: "c1", content: `親のないチャット「x」を作り、依頼を送りました${createdChatMark(31)}。`, is_error: false }),
    ev("tool_use", { id: "c2", name: AI_CREATE_CHAT_TOOL, input: { relation: "child", text: "y" } }),
    ev("tool_result", { tool_use_id: "c2", content: `子チャット「y」を作り、依頼を送りました${createdChatMark(32)}。`, is_error: false }),
    ev("tool_use", { id: "c3", name: AI_CREATE_CHAT_TOOL, input: { relation: "sibling", text: "z" } }),
    ev("tool_result", { tool_use_id: "c3", content: "利用者が断りました", is_error: true }),
    ev("tool_use", { id: "c4", name: AI_CREATE_CHAT_TOOL, input: { relation: "sibling", text: "w" }, parent: "agent" }),
    ev("tool_result", { tool_use_id: "c4", content: `兄弟チャット「w」${createdChatMark(34)}`, is_error: false, parent: "agent" }),
  ];
  const second = ev("user", { text: "もう 1 つ", message_uuid: "u2" });
  events.push(second, ev("tool_use", { id: "c5", name: AI_CREATE_CHAT_TOOL, input: { relation: "sibling", text: "v" } }), ev("tool_result", { tool_use_id: "c5", content: `兄弟チャット「v」${createdChatMark(35)}`, is_error: false }));
  assert.deepEqual([...createdChatsByUser(events)], [[first.id, [31]], [second.id, [35]]]);
});

test("turnExtrasOf: どのターンの頭から読んでも、読んだ作業の終わりの分は全件から作ったものと同じ（ランダムな記録。種は固定）", () => {
  for (const seed of [4, 5, 9]) {
    const events = scenarioChat({ turns: 20, seed });
    const full = turnExtrasOf(events);
    for (const [i, e] of events.entries()) {
      if (e.type !== "result" || i + 1 >= events.length) continue;
      const tail = events.slice(i + 1);
      const ends = new Set(tail.filter((t) => t.type === "result").map((t) => t.id));
      assert.deepEqual(turnExtrasOf(tail), new Map([...full].filter(([id]) => ends.has(id))), `種 ${seed} 切れ目 ${i + 1}`);
    }
  }
});
