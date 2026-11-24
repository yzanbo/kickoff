import assert from "node:assert/strict";
import { test } from "vitest";
import { addLater, EMPTY_OUTBOX, newMessage, type Outbox } from "./outbox";
import { applyQueueCommand, isQueueReject, type QueueCommand } from "./queueCommand";

const env = { now: "2026-11-22T00:00:00.000Z", newId: () => "new" };
const row = (id: string, text = id) => ({ ...newMessage(env, text, {}, []), id });

/** 送信待ち a b c と、預かり h・圧縮後指示 p の箱 */
function box(): Outbox {
  const later = ["a", "b", "c"].map((id) => row(id)).reduce(addLater, EMPTY_OUTBOX);
  return { ...later, now: [row("h"), { ...row("p"), post_compact: true }] };
}

/** 当てた箱（断られたら落とす） */
function applied(b: Outbox, cmd: QueueCommand): Outbox {
  const result = applyQueueCommand(b, cmd, env);
  assert.ok(!isQueueReject(result), JSON.stringify(result));
  return result;
}

const rejected = (b: Outbox, cmd: QueueCommand) => {
  const result = applyQueueCommand(b, cmd, env);
  return isQueueReject(result) ? result : null;
};

test("送信待ちの命令: 消す・書き直すは送信待ちと預かりのどちらの行も指せ、見つからなければ 404", () => {
  const b = box();
  const removed = applied(b, { op: "remove", ids: ["b", "h"] });
  assert.deepEqual([removed.later.map((m) => m.id), removed.now.map((m) => m.id)], [["a", "c"], ["p"]]);
  assert.deepEqual(rejected(b, { op: "remove", ids: ["nope"] }), { reject: 404, message: "待ちの指示が見つかりません" });
  // 文は前後の空白を除き、添付を省けばそのまま
  assert.equal(applied(b, { op: "edit", id: "a", text: " a' " }).later[0].text, "a'");
  assert.equal(applied(b, { op: "edit", id: "h", text: "h'", attachments: [] }).now[0].text, "h'");
  assert.equal(rejected(b, { op: "edit", id: "nope", text: "x" })?.reject, 404);
});

test("送信待ちの命令: 圧縮・消去の行と圧縮後指示は書き直せず、文も添付もなくなるなら 400", () => {
  const withAction = applied(box(), { op: "add_action", action: "clear", after: "a" });
  const clear = withAction.later[1];
  assert.equal(clear.clear, true);
  assert.deepEqual(rejected(withAction, { op: "edit", id: clear.id, text: "x" }), { reject: 400, message: "「コンテキストを消去」の行は書き直せません" });
  assert.equal(rejected(box(), { op: "edit", id: "p", text: "x" })?.message, "圧縮後指示は書き直せません（設定の圧縮後指示を直してください）");
  assert.equal(rejected(box(), { op: "edit", id: "a", text: "  " })?.message, "メッセージか添付ファイルが必要です");
  assert.equal(rejected(box(), { op: "add_action", action: "compact", after: "nope" })?.reject, 404);
});

test("送信待ちの命令: 並べ替え・線・止めておく・まとめる・すべて消す", () => {
  const b = box();
  assert.deepEqual(applied(b, { op: "move", ids: ["c"], to: { index: 0 } }).later.map((m) => m.id), ["c", "a", "b"]);
  assert.equal(rejected(b, { op: "move", ids: ["nope"], to: { index: 0 } })?.reject, 404);
  assert.deepEqual(applied(b, { op: "move", ids: ["a", "b"], to: "bottom" }).later.map((m) => m.id), ["c", "a", "b"]);
  const dropped = applied(applied(b, { op: "set_stops", stops: [1] }), { op: "move", ids: ["c"], to: { before: "b", below_stop: false } });
  assert.deepEqual([dropped.later.map((m) => m.id), dropped.stops], [["a", "c", "b"], [2]]);
  assert.deepEqual(applied(b, { op: "stop_after", id: "a", stop: true }).stops, [1]);
  assert.equal(rejected(b, { op: "stop_after", id: "nope", stop: true })?.reject, 404);
  assert.equal(applied(b, { op: "set_paused", paused: true }).paused, true);
  const merged = applied(b, { op: "merge", ids: ["a", "c"] });
  assert.deepEqual(merged.later.map((m) => [m.id, m.text]), [["a", "a\n\nc"], ["b", "b"]]);
  assert.equal(rejected(b, { op: "merge", ids: ["a"] })?.message, "まとめるには、送信待ちの指示を 2 件以上選んでください");
  // すべて消すのは送信待ちだけ（預かりは残る）
  assert.deepEqual(applied(b, { op: "clear" }), { ...EMPTY_OUTBOX, now: b.now });
  assert.equal(applied(EMPTY_OUTBOX, { op: "clear" }), EMPTY_OUTBOX);
});
