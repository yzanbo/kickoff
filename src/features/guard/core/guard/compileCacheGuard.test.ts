import assert from "node:assert/strict";
import { test } from "vitest";
import { evaluateCompileCacheEnv } from "./compileCacheGuard";

const judge = (command: string) => evaluateCompileCacheEnv("Bash", { command });
const denied = (command: string) => judge(command).kind === "deny";

test("NODE_COMPILE_CACHE / _PORTABLE を設定する書き方は断る", () => {
  for (const command of [
    "NODE_COMPILE_CACHE=/tmp/c /Applications/Kickoff.app/Contents/MacOS/Kickoff",
    'NODE_COMPILE_CACHE="$TMPDIR/c" node app.js',
    "NODE_COMPILE_CACHE_PORTABLE=1 node app.js",
    "FOO=1 NODE_COMPILE_CACHE=/tmp/c node app.js",
    "NODE_COMPILE_CACHE=/tmp/c",
    "env NODE_COMPILE_CACHE=/tmp/c node app.js",
    "/usr/bin/env -i NODE_COMPILE_CACHE=/tmp/c node app.js",
    "env -u PATH NODE_COMPILE_CACHE=/tmp/c node app.js",
    "env -S 'NODE_COMPILE_CACHE=/tmp/c node app.js'",
    "sudo NODE_COMPILE_CACHE=/tmp/c node app.js",
    "export NODE_COMPILE_CACHE=/tmp/c",
    "export NODE_COMPILE_CACHE",
    "export FOO=1 NODE_COMPILE_CACHE_PORTABLE=1",
    "declare -x NODE_COMPILE_CACHE=/tmp/c",
    "typeset -x NODE_COMPILE_CACHE=/tmp/c",
    "open -a Kickoff --env NODE_COMPILE_CACHE=/tmp/c",
    "open -a Kickoff --env=NODE_COMPILE_CACHE=/tmp/c",
    "open -n -a Kickoff --env FOO=1 --env NODE_COMPILE_CACHE=/tmp/c",
    "launchctl setenv NODE_COMPILE_CACHE /tmp/c",
    "cd /tmp && NODE_COMPILE_CACHE=/tmp/c node app.js",
    "true; export NODE_COMPILE_CACHE=/tmp/c",
    "sh -c 'NODE_COMPILE_CACHE=/tmp/c node app.js'",
    'bash -lc "export NODE_COMPILE_CACHE=/tmp/c && open -a Kickoff"',
    "eval 'export NODE_COMPILE_CACHE=/tmp/c'",
    "(NODE_COMPILE_CACHE=/tmp/c node app.js)",
  ]) {
    assert.ok(denied(command), command);
  }
});

test("読むだけ・消すだけ・名前を書くだけは通す", () => {
  for (const command of [
    "echo $NODE_COMPILE_CACHE",
    'echo "${NODE_COMPILE_CACHE:-なし}"',
    "printenv NODE_COMPILE_CACHE",
    "env | grep NODE_COMPILE_CACHE",
    "launchctl getenv NODE_COMPILE_CACHE",
    "unset NODE_COMPILE_CACHE",
    "env -u NODE_COMPILE_CACHE node app.js",
    'grep -rn "NODE_COMPILE_CACHE=" src',
    'git commit -m "NODE_COMPILE_CACHE=… を断る"',
    "npm test",
    "NODE_ENV=test npm test",
    "open -a Kickoff --env FOO=1",
  ]) {
    assert.ok(!denied(command), command);
  }
});

test("断る理由は、起動に別のコードを差し込める穴があることと、利用者が自分のターミナルで流すことを伝える", () => {
  const result = judge("export NODE_COMPILE_CACHE=/tmp/c");
  assert.equal(result.kind, "deny");
  assert.ok(result.kind === "deny" && /別のコードを差し込める/.test(result.reason) && /自分のターミナル/.test(result.reason));
});

test("Bash でないツール・コマンドのない入力は見ない", () => {
  assert.equal(evaluateCompileCacheEnv("Read", { file_path: "NODE_COMPILE_CACHE=/x" }).kind, "pass");
  assert.equal(evaluateCompileCacheEnv("Bash", {}).kind, "pass");
});
