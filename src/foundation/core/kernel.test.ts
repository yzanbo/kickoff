import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { reportChildProcess, type ChildProcessNote } from "@/foundation/core/system/childProcesses";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { BASE_SCHEMA_V1 } from "./db/baseSchema";
import { closeKernel, createKernel } from "./kernel";

const platform = { appDataRoot: "/apps" } as HostPlatform;
const note: ChildProcessNote = { pid: 1, group: false, kind: "agent", state: "started" };
/** 土台の表だけ（機能の表は組み立てが渡す） */
const migrations = [{ version: 1, sql: BASE_SCHEMA_V1 }];

test("Kernel: 保存先を作って DB を開き、閉じると DB と子プロセスの知らせを外す", () => {
  const dataDir = path.join(tempDir(), "Kickoff Test");
  const notes: ChildProcessNote[] = [];
  const clock = manualClock();
  const k = createKernel({ dataDir, port: 4999, platform, clock, onChildProcess: (n) => notes.push(n), migrations });
  assert.ok(fs.existsSync(path.join(dataDir, "kickoff.db")));
  assert.deepEqual(k.paths, { dataDir, port: 4999, host: "127.0.0.1", staticDir: null, appDataRoot: "/apps", databaseId: k.store.databaseId });
  assert.equal(k.clock, clock);
  assert.equal(k.settings, k.store.settings);
  reportChildProcess(note);
  assert.deepEqual(notes, [note]);
  closeKernel(k);
  reportChildProcess(note);
  assert.equal(notes.length, 1);
  assert.throws(() => k.db.prepare("SELECT 1").get());
  const again = createKernel({ dataDir, port: 4999, platform, migrations });
  assert.equal(again.paths.databaseId, k.paths.databaseId);
  closeKernel(again);
});
