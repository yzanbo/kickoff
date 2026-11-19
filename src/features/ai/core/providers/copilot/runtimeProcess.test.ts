import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "vitest";
import type { ChildProcessNote } from "@/foundation/core/host/protocol";
import { setChildProcessReporter } from "@/foundation/core/system/childProcesses";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { noteRuntimeProcess } from "./runtimeProcess";

/** 知らせを受ける（テストのあとに外す） */
function listen() {
  const notes: ChildProcessNote[] = [];
  setChildProcessReporter((n) => notes.push(n));
  afterTest(() => setChildProcessReporter(null));
  return notes;
}

test("Copilot のランタイムの pid を起こしたときと終わったときに知らせ、同じ子は 2 回知らせない", () => {
  const notes = listen();
  const child = Object.assign(new EventEmitter(), { pid: 4321 });
  const client = { cliProcess: child };
  assert.equal(noteRuntimeProcess(client), 4321);
  assert.equal(noteRuntimeProcess(client), null);
  assert.deepEqual(notes, [{ pid: 4321, group: false, kind: "agent", state: "started" }]);
  child.emit("exit", 0);
  assert.deepEqual(notes.at(-1), { pid: 4321, group: false, kind: "agent", state: "exited" });
});

test("子を持たない（外のサーバーにつなぐ・まだ起こしていない・SDK の形が変わった）なら知らせない", () => {
  const notes = listen();
  assert.equal(noteRuntimeProcess({ cliProcess: null }), null);
  assert.equal(noteRuntimeProcess({}), null);
  assert.equal(noteRuntimeProcess(null), null);
  assert.equal(noteRuntimeProcess({ cliProcess: Object.assign(new EventEmitter(), { pid: undefined }) }), null);
  assert.deepEqual(notes, []);
});
