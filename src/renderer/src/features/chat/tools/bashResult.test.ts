import assert from "node:assert/strict";
import { test } from "node:test";
import { clipLines, parseBashResult } from "./bashResult";

test("コマンドの結果: 成功は出力だけ、失敗は先頭の「Exit code n」から終了コードを取り出す", () => {
  assert.deepEqual(parseBashResult("total 8\nREADME.md\n", false), { output: "total 8\nREADME.md", failed: false });
  assert.deepEqual(parseBashResult("Exit code 1\nnpm ERR! missing script", true), { output: "npm ERR! missing script", exitCode: 1, failed: true });
  // 出力のない失敗
  assert.deepEqual(parseBashResult("Exit code 2", true), { output: "", exitCode: 2, failed: true });
  // 終了コードのない失敗（フックで断られたなど）
  assert.deepEqual(parseBashResult("PreToolUse:Bash hook error: 読み取り専用です", true), { output: "PreToolUse:Bash hook error: 読み取り専用です", failed: true });
  assert.deepEqual(parseBashResult("", false), { output: "", failed: false });
  // 色の制御文字は外す
  assert.equal(parseBashResult("\u001b[31m✗\u001b[0m 失敗", false).output, "✗ 失敗");
});

test("長い出力: 先頭から決まった行数だけにし、隠した行の数を返す", () => {
  const text = Array.from({ length: 35 }, (_, i) => `line ${i + 1}`).join("\n");
  const { shown, hidden } = clipLines(text, 30);
  assert.equal(hidden, 5);
  assert.equal(shown.split("\n").length, 30);
  assert.equal(shown.split("\n").at(-1), "line 30");
  assert.deepEqual(clipLines("a\nb", 30), { shown: "a\nb", hidden: 0 });
});
