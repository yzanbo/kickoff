import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { SDKMessage } from "./wire";
import type { CommandOutput } from "@shared/ai/turnEvents";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { manualClock, type ManualClock } from "@/foundation/core/testing/manualClock";
import { until } from "@/foundation/core/testing/until";
import { createCommandOutputWatcher, findOutputFile } from "./commandOutput";

const sdk = (msg: Record<string, unknown>) => msg as unknown as SDKMessage;
const started = (taskId: string, toolUseId: string, taskType = "local_bash") =>
  sdk({ type: "system", subtype: "task_started", task_id: taskId, tool_use_id: toolUseId, task_type: taskType, description: "", session_id: "s1" });

/** Claude Code と同じ形の出力ファイルを作る（作業場所のフォルダ名は何でもよい） */
function outputFile(root: string, taskId: string): string {
  const dir = path.join(root, "-private-tmp-work", "s1", "tasks");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${taskId}.output`);
  fs.writeFileSync(file, "");
  return file;
}

test("出力ファイルは、作業場所のフォルダ名によらずセッション ID と作業 ID で探す", () => {
  const root = tempDir();
  const file = outputFile(root, "b1");
  assert.equal(findOutputFile([path.join(root, "missing"), root], "s1", "b1"), file);
  assert.equal(findOutputFile([root], "s1", "other"), null);
  assert.equal(findOutputFile([root], "s2", "b1"), null);
});

/** 読み直しを 1 回進め、読み終えて次を予約する（watching 個のファイルを見ている）まで待つ */
async function pollOnce(clock: ManualClock, watching = 1) {
  await clock.advance(10);
  await until(() => clock.pending === watching);
}

test("実行中のコマンドの出力: 増えるたびに最後の行を知らせ、終わりの知らせで読むのをやめる", async () => {
  const root = tempDir();
  const file = outputFile(root, "b1");
  const got: CommandOutput[] = [];
  const clock = manualClock();
  const watcher = createCommandOutputWatcher((o) => got.push(o), { roots: [root], pollMs: 10, clock });
  watcher.handle(started("b1", "tu1"));
  fs.appendFileSync(file, "line1\n");
  await pollOnce(clock);
  assert.equal(got.at(-1)?.text, "line1");
  fs.appendFileSync(file, "\x1b[31mline2\x1b[0m\n");
  await pollOnce(clock);
  assert.deepEqual(got.at(-1), { tool_use_id: "tu1", task_id: "b1", text: "line1\nline2" });
  // 変わらなければ知らせない
  const count = got.length;
  await pollOnce(clock);
  assert.equal(got.length, count);
  // 終わったら読むのをやめ（予約が残らない）、増えても知らせない
  watcher.handle(sdk({ type: "system", subtype: "task_notification", task_id: "b1", status: "completed", output_file: "", summary: "", session_id: "s1" }));
  assert.equal(clock.pending, 0);
  fs.appendFileSync(file, "line3\n");
  await clock.advance(10);
  assert.equal(got.length, count);
});

test("実行中のコマンドの出力: コマンドでない作業は読まず、まだないファイルは現れるまで探し、作業の終わりですべてやめる", async () => {
  const root = tempDir();
  const got: CommandOutput[] = [];
  const clock = manualClock();
  const watcher = createCommandOutputWatcher((o) => got.push(o), { roots: [root], pollMs: 10, clock });
  watcher.handle(started("a1", "tu-agent", "local_agent"));
  watcher.handle(started("b2", "tu2"));
  // まだファイルがない間も探し続ける（見ているのはコマンドの 1 つだけ）
  await pollOnce(clock);
  const file = outputFile(root, "b2");
  fs.appendFileSync(file, "late\n");
  await pollOnce(clock);
  assert.equal(got.at(-1)?.text, "late");
  assert.ok(got.every((o) => o.tool_use_id === "tu2"));
  watcher.stopAll();
  assert.equal(clock.pending, 0);
  const count = got.length;
  fs.appendFileSync(file, "after\n");
  await clock.advance(10);
  assert.equal(got.length, count);
});

test("実行中のコマンドの出力: ファイルが見つからないまま時間が過ぎたら、あきらめる", async () => {
  const root = tempDir();
  const got: CommandOutput[] = [];
  const clock = manualClock();
  const watcher = createCommandOutputWatcher((o) => got.push(o), { roots: [root], pollMs: 10, findTimeoutMs: 20, clock });
  watcher.handle(started("b3", "tu3"));
  // 20ms まではまだ探す
  await pollOnce(clock);
  await pollOnce(clock);
  // 20ms を過ぎた読み直しで、あきらめて予約をやめる
  await clock.advance(10);
  await until(() => clock.pending === 0);
  fs.appendFileSync(outputFile(root, "b3"), "too late\n");
  await clock.advance(10);
  assert.equal(got.length, 0);
});
