import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { createSeenChats } from "./seenChats";

test("詳細を読んだチャット: 入れたものだけを直し、忘れる・プロジェクトごと捨てるときに知らせる", () => {
  const seen = createSeenChats();
  let calls = 0;
  seen.subscribe(() => calls++);
  // 持っていないチャットは直さない（一覧の外のチャットを知らせだけで増やさない）
  seen.update(makeChat(1));
  assert.equal(seen.get(1), undefined);
  const one = makeChat(1, { project_id: 7 });
  seen.remember(one);
  seen.remember(one);
  assert.equal(calls, 1);
  seen.update(makeChat(1, { project_id: 7, status: "completed" }));
  assert.equal(seen.get(1)?.status, "completed");
  seen.remember(makeChat(2, { project_id: 8 }));
  seen.forgetProject(7);
  assert.equal(seen.get(1), undefined);
  assert.equal(seen.get(2)?.id, 2);
  seen.forget(2);
  seen.forget(2);
  assert.equal(calls, 5);
});

test("詳細を読んだチャット: 持っていないチャットの行は、待ってから 1 回だけ取って入れ、取れなかった ID は取り直さない", async () => {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  const seen = createSeenChats();
  const asked: number[] = [];
  const load = (id: number) => async () => {
    asked.push(id);
    if (id === 9) throw new Error("not found");
    return makeChat(id, { title: `chat ${id}` });
  };
  // 待っている間に取りやめたら取らない
  seen.fetch(1, load(1), 1000)();
  await vi.advanceTimersByTimeAsync(1000);
  assert.deepEqual(asked, []);
  // 取りに行っている間は重ねて取らない
  seen.fetch(1, load(1), 1000);
  await vi.advanceTimersByTimeAsync(999);
  assert.deepEqual(asked, []);
  seen.fetch(1, load(1), 1);
  await vi.advanceTimersByTimeAsync(1);
  seen.fetch(1, load(1), 0);
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(seen.get(1)?.title, "chat 1");
  assert.deepEqual(asked, [1]);
  // 持っているチャットは取らない・取れなかった ID は取り直さない
  seen.fetch(1, load(1), 0);
  seen.fetch(9, load(9), 0);
  await vi.advanceTimersByTimeAsync(0);
  seen.fetch(9, load(9), 0);
  await vi.advanceTimersByTimeAsync(0);
  assert.deepEqual(asked, [1, 9]);
  // 忘れたら、また取れる
  seen.forget(1);
  seen.fetch(1, load(1), 0);
  await vi.advanceTimersByTimeAsync(0);
  assert.deepEqual(asked, [1, 9, 1]);
});
