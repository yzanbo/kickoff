import { test } from "vitest";
import assert from "node:assert/strict";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { createStopper, failureFlags, STOP_GRACE_MS } from "./turnLifecycle";

function recorder(clock = manualClock()) {
  const calls: string[] = [];
  return { calls, clock, opts: { interrupt: () => calls.push("interrupt"), onForced: () => calls.push("forced"), clock } };
}

test("止める合図で interrupt を呼び、5 秒待って onForced を呼ぶ", async () => {
  const ac = new AbortController();
  const rec = recorder();
  createStopper(ac.signal, rec.opts);
  assert.deepEqual(rec.calls, []);
  ac.abort();
  assert.deepEqual(rec.calls, ["interrupt"]);
  await rec.clock.advance(STOP_GRACE_MS - 1);
  assert.deepEqual(rec.calls, ["interrupt"]);
  await rec.clock.advance(1);
  assert.deepEqual(rec.calls, ["interrupt", "forced"]);
});

test("足したときにもう止められていれば、すぐ interrupt を呼ぶ（待つ長さは graceMs で変えられる）", async () => {
  const ac = new AbortController();
  ac.abort();
  const rec = recorder();
  createStopper(ac.signal, { ...rec.opts, graceMs: 100 });
  assert.deepEqual(rec.calls, ["interrupt"]);
  await rec.clock.advance(100);
  assert.deepEqual(rec.calls, ["interrupt", "forced"]);
});

test("dispose のあとは、合図が来ても待っていても呼ばない", async () => {
  const before = new AbortController();
  const idle = recorder();
  createStopper(before.signal, idle.opts).dispose();
  before.abort();
  assert.deepEqual(idle.calls, []);

  const during = new AbortController();
  const waiting = recorder();
  const stopper = createStopper(during.signal, waiting.opts);
  during.abort();
  stopper.dispose();
  await waiting.clock.advance(STOP_GRACE_MS);
  assert.deepEqual(waiting.calls, ["interrupt"]);
});

test("失敗の印: CLI が種類を知らせたら種類だけで決め、知らせないときだけ文から見分ける", () => {
  // Codex・Copilot は種類を返す（使用枠でないと言われたら、文に「limit reached」があっても使用枠にしない）
  assert.deepEqual(failureFlags("context limit reached", { usageLimit: false }), {});
  assert.deepEqual(failureFlags("失敗", { usageLimit: true }), { usageLimit: { resetsAt: null } });
  // 種類を知らせない CLI（ACP）は文から見分ける
  assert.deepEqual(failureFlags("Claude AI usage limit reached"), { usageLimit: { resetsAt: null } });
  assert.deepEqual(failureFlags("ECONNRESET"), { network: true });
});
