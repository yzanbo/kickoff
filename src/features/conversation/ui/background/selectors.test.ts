import assert from "node:assert/strict";
import { test } from "vitest";
import type { BackgroundState } from "@shared/ai/turnEvents";
import type { ChatSource } from "@/features/chat/ui";
import { backgroundCallIds, createBackgroundCalls } from "./selectors";

test("裏で動いている呼び出しは、中身が同じなら同じ Set（作業中の様子が替わっても）", () => {
  // 店の口のうち、作業中の様子の裏の作業だけを差し替えられる偽物
  const state = { background: null as BackgroundState | null };
  const source = { detail: () => ({ live: { background: state.background } }) } as unknown as ChatSource;
  const calls = createBackgroundCalls();
  const background = (ids: string[]): BackgroundState => ({ tasks: ids.map((id) => ({ task_id: `t-${id}`, tool_use_id: id, kind: "bash", description: id })) }) as unknown as BackgroundState;
  assert.equal(calls(source, 1).size, 0);
  state.background = background(["x"]);
  const first = calls(source, 1);
  assert.deepEqual([...first], ["x"]);
  state.background = background(["x"]);
  assert.equal(calls(source, 1), first);
  state.background = background(["x", "y"]);
  assert.deepEqual([...calls(source, 1)], ["x", "y"]);
});

test("裏の作業を起動した呼び出しの ID: 開始の知らせが届いて ID の分かるものだけ", () => {
  assert.deepEqual(backgroundCallIds(null), []);
  assert.deepEqual(
    backgroundCallIds({
      tasks: [
        { task_id: "b1", kind: "command", description: "npm run dev", tool_use_id: "tu1" },
        { task_id: "b2", kind: "command", description: "sleep 9" },
      ],
      replied: false,
    }),
    ["tu1"],
  );
});
