import assert from "node:assert/strict";
import { test } from "node:test";
import type { Attachment, QueuedMessage } from "../../../../core/types";
import { seedOf } from "./askInNewChat";

const image = (id: string): Attachment => ({ id, name: `${id}.png`, mime: "image/png", size: 10 }) as Attachment;
const message = (id: string, text: string, attachments: Attachment[] = []): QueuedMessage => ({ id, text, attachments, options: {}, created_at: "" }) as QueuedMessage;

test("送信待ちの指示から新しいチャットの初めの入力を作る: 列の順に、文は空行でつなぎ、添付は順に並べる", () => {
  const queue = [message("a", " 1 つ目 ", [image("x")]), message("b", ""), message("c", "3 つ目", [image("y"), image("z")])];
  // 選んだ順ではなく列の順（空の文は飛ばす。添付だけの指示の添付は残す）
  const seed = seedOf(queue, ["c", "a", "b"]);
  assert.equal(seed.text, "1 つ目\n\n3 つ目");
  assert.deepEqual(
    seed.attachments.map((a) => a.id),
    ["x", "y", "z"],
  );
  assert.deepEqual(seedOf(queue, ["b"]), { text: "", attachments: [] });
});
