import { test } from "vitest";
import assert from "node:assert/strict";
import { agentSpawnNotes } from "./spawnNotes.js";

test("Claude Code の SDK が起動した PID を実行の診断へ知らせる。プロセスの後始末の通知も維持する", () => {
  const pids: number[] = [];
  const notes = agentSpawnNotes((pid) => pids.push(pid));
  notes.options.onProcessSpawned(123);
  notes.options.onProcessSpawned(456);
  notes.release();
  notes.release();
  assert.deepEqual(pids, [123, 456]);
  agentSpawnNotes().options.onProcessSpawned(789);
});
