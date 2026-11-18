// AI を動かさず、無作為な存在しない ID の再開がどう断られるかだけを調べる。
// 利用者のターミナルで `node scripts/check-provider-missing-sessions.mjs` と実行する。
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { query } from "@anthropic-ai/claude-agent-sdk";

async function checkCodex(id) {
  return new Promise((resolve) => {
    const child = spawn("codex", ["app-server"], { cwd: tmpdir(), stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "タイムアウト" }), 15000);
    child.on("error", () => finish({ ok: false, reason: "codex を起動できません" }));
    child.on("exit", () => finish({ ok: false, reason: "応答前に終了しました" }));
    child.stdin.on("error", () => {});
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && !message.error) {
          child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
          child.stdin.write(`${JSON.stringify({ id: 2, method: "thread/resume", params: { threadId: id } })}\n`);
        } else if (message.id === 1) finish({ ok: false, reason: "初期化に失敗しました" });
        else if (message.id === 2) {
          const code = message.error?.code ?? null;
          const expected = message.error?.message === `no rollout found for thread id ${id}`;
          finish({ ok: code === -32600 && expected, code, expected_message: expected });
        }
      }
    });
    child.stdin.write(`${JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "kickoff-check", version: "1" }, capabilities: { experimentalApi: true, requestAttestation: false } } })}\n`);
  });
}

async function checkClaude(id) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let result;
  let other = false;
  let error = "";
  try {
    for await (const message of query({ prompt: "応答しないでください。", options: { cwd: tmpdir(), resume: id, tools: [], settingSources: [], abortController: controller } })) {
      if (message.type === "result") result = message;
      else other = true;
    }
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  finally { clearTimeout(timer); }
  const message = `No conversation found with session ID: ${id}`;
  const expected = result?.subtype === "error_during_execution" && result.session_id === id && result.errors?.length === 1 && result.errors[0] === message && error === `Claude Code returned an error result: ${message}` && !other;
  return { ok: Boolean(expected), expected_result: Boolean(expected), timed_out: controller.signal.aborted };
}

const id = randomUUID();
const [codex, claude] = await Promise.all([checkCodex(id), checkClaude(id)]);
console.log(JSON.stringify({ codex, claude }, null, 2));
if (!codex.ok || !claude.ok) process.exitCode = 1;
