import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CommandOutput } from "@shared/types";
import { tempDir } from "../../testing/tempDir.js";
import { until } from "../../testing/testCore.js";
import { cleanTerminalText, createCommandOutputWatcher, findOutputFile, tailLines } from "./commandOutput.js";

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

test("端末向けの出力: 色の制御文字を除き、\\r で上書きした行は最後の状態だけにする", () => {
  assert.equal(cleanTerminalText("\x1b[32mok\x1b[0m done"), "ok done");
  assert.equal(cleanTerminalText("\x1b]0;title\x07text"), "text");
  assert.equal(cleanTerminalText("10%\r50%\r100%\nnext"), "100%\nnext");
  assert.equal(cleanTerminalText("progress 3/3\r\nend"), "progress 3/3\nend");
  assert.equal(cleanTerminalText("bar\r"), "bar");
  assert.equal(cleanTerminalText("a\x07b\tc"), "ab\tc");
});

test("最後の n 行（終わりの改行は数えない）", () => {
  assert.equal(tailLines("1\n2\n3\n4\n", 2), "3\n4");
  assert.equal(tailLines("only", 5), "only");
  assert.equal(tailLines("", 3), "");
});

test("出力ファイルは、作業場所のフォルダ名によらずセッション ID と作業 ID で探す", () => {
  const root = tempDir();
  const file = outputFile(root, "b1");
  assert.equal(findOutputFile([path.join(root, "missing"), root], "s1", "b1"), file);
  assert.equal(findOutputFile([root], "s1", "other"), null);
  assert.equal(findOutputFile([root], "s2", "b1"), null);
});

test("実行中のコマンドの出力: 増えるたびに最後の行を知らせ、終わりの知らせで読むのをやめる", async () => {
  const root = tempDir();
  const file = outputFile(root, "b1");
  const got: CommandOutput[] = [];
  const watcher = createCommandOutputWatcher((o) => got.push(o), { roots: [root], pollMs: 10 });
  watcher.handle(started("b1", "tu1"));
  fs.appendFileSync(file, "line1\n");
  await until(() => got.at(-1)?.text === "line1");
  fs.appendFileSync(file, "\x1b[31mline2\x1b[0m\n");
  await until(() => got.at(-1)?.text === "line1\nline2");
  assert.deepEqual(got.at(-1), { tool_use_id: "tu1", task_id: "b1", text: "line1\nline2" });
  // 変わらなければ知らせない
  const count = got.length;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(got.length, count);
  // 終わったら、増えても知らせない
  watcher.handle(sdk({ type: "system", subtype: "task_notification", task_id: "b1", status: "completed", output_file: "", summary: "", session_id: "s1" }));
  fs.appendFileSync(file, "line3\n");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(got.length, count);
});

test("実行中のコマンドの出力: コマンドでない作業は読まず、まだないファイルは現れるまで探し、作業の終わりですべてやめる", async () => {
  const root = tempDir();
  const got: CommandOutput[] = [];
  const watcher = createCommandOutputWatcher((o) => got.push(o), { roots: [root], pollMs: 10 });
  watcher.handle(started("a1", "tu-agent", "local_agent"));
  watcher.handle(started("b2", "tu2"));
  await new Promise((r) => setTimeout(r, 30));
  const file = outputFile(root, "b2");
  fs.appendFileSync(file, "late\n");
  await until(() => got.at(-1)?.text === "late");
  assert.ok(got.every((o) => o.tool_use_id === "tu2"));
  watcher.stopAll();
  const count = got.length;
  fs.appendFileSync(file, "after\n");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(got.length, count);
});

test("実行中のコマンドの出力: ファイルが見つからないまま時間が過ぎたら、あきらめる", async () => {
  const root = tempDir();
  const got: CommandOutput[] = [];
  const watcher = createCommandOutputWatcher((o) => got.push(o), { roots: [root], pollMs: 10, findTimeoutMs: 20 });
  watcher.handle(started("b3", "tu3"));
  await new Promise((r) => setTimeout(r, 60));
  fs.appendFileSync(outputFile(root, "b3"), "too late\n");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(got.length, 0);
});
