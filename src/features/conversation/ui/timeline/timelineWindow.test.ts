import assert from "node:assert/strict";
import { test } from "vitest";
import { makeEvent } from "@shared/chat/testing";
import { itemIndexOfEvent } from "./timelineWindow";
import type { TimelineItem } from "@/features/conversation/ui/timelineItems";

// 位置を探すだけなので、中身は見ない
const use = (id: number) => makeEvent(id, "tool_use", { id: `tu${id}`, name: "Read", input: {} });
const result = (id: number) => makeEvent(id, "tool_result", { tool_use_id: `tu${id - 1}`, content: "" });

test("流れの窓: 記録の ID から項目の位置を探す（発言と、ツールの呼び出し・結果）", () => {
  const items: TimelineItem[] = [
    { kind: "event", key: "e1", event: makeEvent(1, "text", { text: "" }) },
    { kind: "tools", key: "t2", tools: [{ use: use(2), result: result(3) }, { use: use(4) }] },
    { kind: "event", key: "e5", event: makeEvent(5, "text", { text: "" }) },
  ];
  assert.equal(itemIndexOfEvent(items, 1), 0);
  assert.equal(itemIndexOfEvent(items, 3), 1);
  assert.equal(itemIndexOfEvent(items, 4), 1);
  assert.equal(itemIndexOfEvent(items, 5), 2);
  assert.equal(itemIndexOfEvent(items, 9), -1);
});
