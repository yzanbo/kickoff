import assert from "node:assert/strict";
import { test } from "vitest";
import type { QueuedMessage } from "@shared/chat/types";
import { collapsedNext, queuedListItems, queuedShape, sentShownKey } from "./queuedListModel";

const row = (id: string, patch: Partial<QueuedMessage> = {}): QueuedMessage => ({ id, text: `${id} の文\n2 行目`, options: {}, attachments: [], created_at: "", ...patch });
const shapeOf = (items: ReturnType<typeof queuedListItems>) => items.map((x) => (x.kind === "stop" ? `|${x.at}:${x.nth}/${x.here}` : `${x.message.id}${x.editing ? "*" : ""}`));

test("一覧の並び: 行の前にその位置の印の線（重なれば本数ぶん）、最後にすべて送ったあとの線、書き直している行は印", () => {
  const items = queuedListItems([row("a"), row("b")], [0, 0, 2], (id) => id === "b");
  assert.deepEqual(shapeOf(items), ["|0:0/2", "|0:1/2", "a", "b*", "|2:0/1"]);
  assert.deepEqual(shapeOf(queuedListItems([], [0], () => false)), ["|0:0/1"]);
});

test("出し方: 空でも、作業中で 1 件目の上に印があれば 1 行。送信中が残っていれば一覧", () => {
  assert.equal(queuedShape(0, 0, true, [0]), "pause");
  assert.equal(queuedShape(0, 0, false, [0]), null);
  assert.equal(queuedShape(0, 0, true, []), null);
  assert.equal(queuedShape(0, 1, false, []), "list");
  assert.equal(queuedShape(2, 0, false, []), "list");
});

test("畳んだ 1 行の「次:」は 1 件目の初めの行（開いているときは出さない）", () => {
  assert.equal(collapsedNext(true, [row("a"), row("b")]), "a の文");
  assert.equal(collapsedNext(false, [row("a")]), "");
  assert.equal(collapsedNext(true, []), "");
  assert.equal(collapsedNext(true, [row("c", { text: "", compact: true })]), "会話を圧縮");
});

test("sentShownKey: 自分の発言が増えても、預かった指示が増えても変わる（送った指示がどこかに出た）", () => {
  const before = sentShownKey(10, []);
  assert.equal(sentShownKey(10, []), before);
  assert.notEqual(sentShownKey(11, []), before);
  assert.notEqual(sentShownKey(10, [{ id: "a" }]), before);
  assert.notEqual(sentShownKey(10, [{ id: "a" }]), sentShownKey(10, [{ id: "b" }]));
});
