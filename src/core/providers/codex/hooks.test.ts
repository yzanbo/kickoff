// Codex の PreToolUse フック（hooks.ts）と口（hookServer.ts）。フックのコマンドは本物の sh と curl で流し、引用の誤りがないかを確かめる
import { test } from "vitest";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { afterTest } from "../../testing/afterTest.js";
import { findKickoffHook, HOOK_COMMAND, HOOK_TOKEN_ENV, HOOK_UNREACHABLE, HOOK_URL_ENV, hookDeny, patchPaths } from "./hooks.js";
import { startHookServer } from "./hookServer.js";

/** フックのコマンドを Codex と同じく sh で流し、標準出力を返す */
function runHook(env: Record<string, string>, input: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("/bin/sh", ["-c", HOOK_COMMAND], { env: { PATH: "/usr/bin:/bin", ...env } }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
    child.stdin?.end(JSON.stringify(input));
  });
}

test("フックのコマンド: 入力を口に渡して答えをそのまま出し、何も言わなければ空、口に届かなければ断る答えを出す", async () => {
  const seen: unknown[] = [];
  const server = await startHookServer(async (input) => {
    seen.push(input);
    return (input as { tool_input: { command: string } }).tool_input.command.startsWith("rm") ? hookDeny("消せません（'引用' と \"二重\" も通る）") : null;
  });
  afterTest(() => server.close());
  const env = { [HOOK_URL_ENV]: server.url, [HOOK_TOKEN_ENV]: server.token };

  const denied = JSON.parse(await runHook(env, { tool_name: "Bash", tool_input: { command: "rm -rf a" } }));
  assert.deepEqual(denied, hookDeny("消せません（'引用' と \"二重\" も通る）"));
  assert.equal(await runHook(env, { tool_name: "Bash", tool_input: { command: "ls" } }), "");
  assert.deepEqual(seen[1], { tool_name: "Bash", tool_input: { command: "ls" } });

  // 鍵が違う・口がない → 守りを当てずに通さない
  assert.deepEqual(JSON.parse(await runHook({ ...env, [HOOK_TOKEN_ENV]: "wrong" }, { tool_name: "Bash", tool_input: { command: "ls" } })), hookDeny(HOOK_UNREACHABLE));
  assert.deepEqual(JSON.parse(await runHook({}, { tool_name: "Bash", tool_input: { command: "ls" } })), hookDeny(HOOK_UNREACHABLE));
});

test("口: 判定で投げたら 500（フックは断る答えを出す）", async () => {
  const server = await startHookServer(async () => {
    throw new Error("x");
  });
  afterTest(() => server.close());
  const res = await fetch(server.url, { method: "POST", headers: { Authorization: `Bearer ${server.token}` }, body: "{}" });
  assert.equal(res.status, 500);
  assert.deepEqual(JSON.parse(await runHook({ [HOOK_URL_ENV]: server.url, [HOOK_TOKEN_ENV]: server.token }, {})), hookDeny(HOOK_UNREACHABLE));
});

test("patchPaths: apply_patch の足す・変える・消す・移す先を読む", () => {
  const patch = ["*** Begin Patch", "*** Add File: a.txt", "+hi", "*** Update File: src/b.ts", "*** Move to: src/c.ts", "@@", "-x", "+y", "*** Delete File: /abs/d.md", "*** End Patch"].join("\n");
  assert.deepEqual(patchPaths(patch), ["a.txt", "src/b.ts", "src/c.ts", "/abs/d.md"]);
  assert.deepEqual(patchPaths("echo hi"), []);
});

test("findKickoffHook: 実行ごとの設定で渡した Kickoff のフックだけを探す（利用者のフックは除く）", () => {
  const ours = { key: "k", eventName: "preToolUse", source: "sessionFlags", command: HOOK_COMMAND, currentHash: "h", trustStatus: "untrusted", enabled: true };
  const user = { ...ours, key: "u", source: "user" };
  assert.equal(findKickoffHook({ data: [{ hooks: [user, ours] }] })?.key, "k");
  assert.equal(findKickoffHook({ data: [{ hooks: [user] }] }), null);
});
