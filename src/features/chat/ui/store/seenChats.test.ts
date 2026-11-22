import assert from "node:assert/strict";
import { test } from "vitest";
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
