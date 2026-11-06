import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubagentEntry } from "@shared/chat/subagents";
import type { BackgroundTask } from "@shared/types";
import { eventSequence } from "@shared/testing/factories";
import { backgroundCallTarget } from "./backgroundTarget";

const ev = eventSequence();
const task = (toolUseId?: string): BackgroundTask => ({ task_id: "b1", kind: "command", description: "npm run dev", ...(toolUseId ? { tool_use_id: toolUseId } : {}) });

test("裏の作業の移る先: 起動した呼び出しの記録と、サブエージェントの中ならそのサブエージェント", () => {
  const main = ev("tool_use", { id: "tu-main", name: "Bash", input: {} });
  const inAgent = ev("tool_use", { id: "tu-sub", name: "Bash", input: {}, parent: "agent-1" });
  const resumed = ev("tool_use", { id: "tu-resumed", name: "Bash", input: {}, parent: "send-2" });
  const lost = ev("tool_use", { id: "tu-lost", name: "Bash", input: {}, parent: "agent-x" });
  const events = [main, inAgent, resumed, lost];
  // 再開した回（SendMessage）の呼び出し ID も、同じサブエージェントとして引き当てる
  const agents = [{ key: "agent-1", aliases: ["send-2"] } as SubagentEntry];
  assert.deepEqual(backgroundCallTarget(task("tu-main"), events, agents), { eventId: main.id, agent: null });
  assert.deepEqual(backgroundCallTarget(task("tu-sub"), events, agents), { eventId: inAgent.id, agent: "agent-1" });
  assert.deepEqual(backgroundCallTarget(task("tu-resumed"), events, agents), { eventId: resumed.id, agent: "agent-1" });
  // 呼び出しの ID が届いていない・記録にない・持ち主のサブエージェントが分からないときは移らない
  assert.equal(backgroundCallTarget(task(), events, agents), null);
  assert.equal(backgroundCallTarget(task("tu-none"), events, agents), null);
  assert.equal(backgroundCallTarget(task("tu-lost"), events, agents), null);
});
