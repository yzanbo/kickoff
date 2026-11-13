import assert from "node:assert/strict";
import { test } from "node:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BackgroundState, BackgroundTask } from "@shared/types";
import { createTurnOver } from "./turnOver.js";

const stateMsg = (state: "idle" | "running" | "requires_action") => ({ type: "system", subtype: "session_state_changed", state }) as unknown as SDKMessage;
const resultMsg = { type: "result" } as unknown as SDKMessage;
const tasksMsg = { type: "system", subtype: "background_tasks_changed" } as unknown as SDKMessage;
const task: BackgroundTask = { task_id: "t1", kind: "command", description: "sleep" };
const bg = (tasks: BackgroundTask[], replied: boolean): BackgroundState => ({ tasks, replied });

/** 手で進める時計 */
function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    timers: {
      set: (fn: () => void) => {
        pending.set(next, fn);
        return next++;
      },
      clear: (h: unknown) => void pending.delete(h as number),
    },
    fire() {
      const fns = [...pending.values()];
      pending.clear();
      fns.forEach((fn) => fn());
    },
    get size() {
      return pending.size;
    },
  };
}

function setup() {
  const clock = fakeTimers();
  let closed = 0;
  const turnOver = createTurnOver(() => closed++, { timers: clock.timers });
  return { turnOver, clock, closed: () => closed };
}

test("createTurnOver: 返答の終わりでは閉じず、Claude Code の idle で閉じる", () => {
  const { turnOver, closed } = setup();
  turnOver.note(stateMsg("running"), undefined);
  turnOver.note(resultMsg, bg([], true));
  assert.equal(closed(), 0, "result だけでは閉じない");
  turnOver.note(stateMsg("idle"), undefined);
  assert.equal(closed(), 1);
});

test("createTurnOver: 返答の終わりの直前に届いた発言で次の返答が続くときは、その返答の idle まで閉じない", () => {
  const { turnOver, closed } = setup();
  turnOver.note(stateMsg("running"), undefined);
  // 1 回目の返答の終わり（Claude Code は idle を出さずに、届いていた発言の返答を始める）
  turnOver.note(resultMsg, bg([], true));
  turnOver.note({ type: "assistant", parent_tool_use_id: null } as unknown as SDKMessage, bg([], false));
  assert.equal(closed(), 0);
  turnOver.note(resultMsg, bg([], true));
  turnOver.note(stateMsg("idle"), undefined);
  assert.equal(closed(), 1);
});

test("createTurnOver: 裏の作業があるうちの idle では閉じず、0 件になっても終わりの知らせへの返答の idle を待つ", () => {
  const { turnOver, clock, closed } = setup();
  turnOver.note(stateMsg("running"), undefined);
  turnOver.note(tasksMsg, bg([task], false));
  turnOver.note(resultMsg, bg([task], true));
  turnOver.note(stateMsg("idle"), undefined);
  assert.equal(closed(), 0, "裏の作業が動いている");
  // 0 件を知らせてから、終わりの知らせへの返答を始める
  turnOver.note(tasksMsg, bg([], true));
  assert.equal(closed(), 0, "0 件になった時点では閉じない");
  turnOver.note(stateMsg("running"), undefined);
  assert.equal(clock.size, 0, "返答を始めたら待つのをやめる");
  turnOver.note(resultMsg, bg([], true));
  turnOver.note(stateMsg("idle"), undefined);
  assert.equal(closed(), 1);
});

test("createTurnOver: 裏の作業が 0 件になっても返答を始めなければ、待ってから閉じる", () => {
  const { turnOver, clock, closed } = setup();
  turnOver.note(stateMsg("running"), undefined);
  turnOver.note(tasksMsg, bg([task], true));
  turnOver.note(stateMsg("idle"), undefined);
  turnOver.note(tasksMsg, bg([], true));
  assert.equal(closed(), 0);
  clock.fire();
  assert.equal(closed(), 1);
});

test("createTurnOver: 発言を足したあとの idle は少し待ち、その間に足した発言の返答が始まればその idle で閉じる", () => {
  const { turnOver, clock, closed } = setup();
  turnOver.note(stateMsg("running"), undefined);
  turnOver.pushed();
  // Claude Code が発言を読む前に idle を出した
  turnOver.note(resultMsg, bg([], true));
  turnOver.note(stateMsg("idle"), undefined);
  assert.equal(closed(), 0, "足した発言を読む前の idle では閉じない");
  turnOver.note(stateMsg("running"), undefined);
  assert.equal(clock.size, 0);
  turnOver.note(stateMsg("idle"), undefined);
  assert.equal(closed(), 1, "足した発言の返答のあとの idle で閉じる");
});

test("createTurnOver: 足した発言をいまの返答で読んでいたら（次の返答が始まらない）、待ってから閉じる", () => {
  const { turnOver, clock, closed } = setup();
  turnOver.note(stateMsg("running"), undefined);
  turnOver.pushed();
  turnOver.note(stateMsg("idle"), undefined);
  assert.equal(closed(), 0);
  clock.fire();
  assert.equal(closed(), 1);
});

test("createTurnOver: 承認を待っている間（requires_action）は閉じない", () => {
  const { turnOver, closed } = setup();
  turnOver.note(stateMsg("running"), undefined);
  turnOver.note(stateMsg("requires_action"), undefined);
  turnOver.note(resultMsg, bg([], true));
  assert.equal(closed(), 0);
});

test("createTurnOver: session_state_changed を出さない Claude Code では、返答の終わりと裏の作業 0 件で閉じる", () => {
  const { turnOver, closed } = setup();
  turnOver.note(tasksMsg, bg([task], false));
  turnOver.note(resultMsg, bg([task], true));
  assert.equal(closed(), 0);
  turnOver.note(tasksMsg, bg([], true));
  assert.equal(closed(), 1);
});

test("createTurnOver: stop で待っている閉じるをやめる", () => {
  const { turnOver, clock, closed } = setup();
  turnOver.note(stateMsg("idle"), undefined);
  turnOver.note(tasksMsg, bg([task], true));
  turnOver.note(tasksMsg, bg([], true));
  turnOver.stop();
  clock.fire();
  // 最初の idle（裏の作業 0 件）で 1 回閉じたあとは、待っていた分では閉じない
  assert.equal(closed(), 1);
});
