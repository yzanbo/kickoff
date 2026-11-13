import assert from "node:assert/strict";
import { test } from "node:test";
import { PRE_COMPACT_DONE, PRE_COMPACT_NUDGE } from "@shared/chat/prompts";
import { fakeTimers } from "../../testing/fakeTimers.js";
import { createPreCompactGate, replyText } from "./preCompact.js";

/** ウィンドウ 200k・始めの大きさ 150k のゲートと、足した発言の記録 */
function setup(opts: { contextTokens?: number | null; push?: boolean } = {}) {
  const pushed: string[] = [];
  const sent: string[] = [];
  const nudged: string[] = [];
  const clock = fakeTimers();
  const gate = createPreCompactGate({
    message: "指示",
    contextWindow: 200_000,
    contextTokens: opts.contextTokens === undefined ? 150_000 : opts.contextTokens,
    push: (text, uuid) => {
      pushed.push(`${uuid}:${text}`);
      return opts.push ?? true;
    },
    onSent: (uuid) => sent.push(uuid),
    onNudged: (uuid) => nudged.push(uuid),
    newId: () => `id${pushed.length + 1}`,
    timers: clock.timers,
  });
  return { gate, pushed, sent, nudged, clock };
}

/** 指示を足し、合図の一文まで済ませたゲート */
function signaled() {
  const s = setup();
  s.gate.shouldBlock("auto", undefined);
  s.gate.noteReply(160_000, PRE_COMPACT_DONE);
  return s;
}

test("自動の圧縮: 1 回目に指示を足して止め、合図の一文が来るまで止め続ける", () => {
  const { gate, pushed, sent } = setup();
  assert.equal(gate.shouldBlock("auto", undefined), true);
  assert.deepEqual(pushed, ["id1:指示"]);
  assert.deepEqual(sent, ["id1"]);
  gate.noteReply(160_000, null);
  assert.equal(gate.shouldBlock("auto", undefined), true);
  gate.noteReply(165_000, `${PRE_COMPACT_DONE}`);
  assert.equal(gate.shouldBlock("auto", undefined), false);
  // 足すのは 1 回だけ
  assert.equal(pushed.length, 1);
});

test("自動の圧縮: 手で頼んだ・サブエージェントの圧縮は止めない", () => {
  const { gate, pushed } = setup();
  assert.equal(gate.shouldBlock("manual", undefined), false);
  assert.equal(gate.shouldBlock("auto", "agent-1"), false);
  assert.equal(pushed.length, 0);
});

test("自動の圧縮: 残りが少ない・大きさが分からないときは足さずに通す", () => {
  assert.equal(setup({ contextTokens: 180_000 }).gate.shouldBlock("auto", undefined), false);
  assert.equal(setup({ contextTokens: null }).gate.shouldBlock("auto", undefined), false);
  // 足せなかった（入力が閉じている）
  assert.equal(setup({ push: false }).gate.shouldBlock("auto", undefined), false);
});

test("自動の圧縮: 応答が来ないまま続けて呼ばれたら（あふれたときの圧縮）通す", () => {
  const { gate } = setup();
  assert.equal(gate.shouldBlock("auto", undefined), true);
  assert.equal(gate.shouldBlock("auto", undefined), false);
});

test("自動の圧縮: 止め続ける間も、残りが減るか回数の上限で通す", () => {
  const near = setup();
  assert.equal(near.gate.shouldBlock("auto", undefined), true);
  near.gate.noteReply(185_000, null);
  assert.equal(near.gate.shouldBlock("auto", undefined), false);

  const many = setup();
  let holds = 0;
  while (many.gate.shouldBlock("auto", undefined)) {
    holds += 1;
    many.gate.noteReply(150_000, null);
    assert.ok(holds < 20);
  }
  assert.equal(holds, 8);
});

test("自動の圧縮: 圧縮したら、次に上限に近づいたときにまた足す", () => {
  const { gate, pushed } = setup();
  assert.equal(gate.shouldBlock("auto", undefined), true);
  gate.noteReply(160_000, PRE_COMPACT_DONE);
  assert.equal(gate.shouldBlock("auto", undefined), false);
  gate.noteCompacted(30_000);
  gate.noteReply(150_000, null);
  assert.equal(gate.shouldBlock("auto", undefined), true);
  assert.equal(pushed.length, 2);
});

test("応答の文: 文の部分だけをつなぎ、なければ null", () => {
  const content: { type: string; text?: string }[] = [{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }];
  assert.equal(replyText(content), "a\nb");
  assert.equal(replyText([{ type: "tool_use" }]), null);
});

test("背中を押す: 合図のあと裏の作業だけを待って止まり続けたら、発言を 1 回足す", () => {
  const { gate, pushed, nudged, clock } = signaled();
  gate.noteWaiting(true);
  assert.equal(clock.size, 1);
  // 待っている間に何度知らせても、待ち直さない
  gate.noteWaiting(true);
  assert.equal(clock.size, 1);
  clock.fire();
  assert.deepEqual(pushed, ["id1:指示", `id2:${PRE_COMPACT_NUDGE}`]);
  assert.deepEqual(nudged, ["id2"]);
  // 押すのは 1 回だけ
  gate.noteWaiting(false);
  gate.noteWaiting(true);
  assert.equal(clock.size, 0);
});

test("背中を押す: 待つ間に動き出した・裏の作業がなくなったらやめ、合図の前・圧縮のあとは押さない", () => {
  const moved = signaled();
  moved.gate.noteWaiting(true);
  moved.gate.noteWaiting(false);
  assert.equal(moved.clock.size, 0);
  assert.equal(moved.nudged.length, 0);
  // 合図の前（指示の作業の途中）
  const before = setup();
  before.gate.shouldBlock("auto", undefined);
  before.gate.noteWaiting(true);
  assert.equal(before.clock.size, 0);
  // 合図のあと、ツールの結果で圧縮が走った
  const compacted = signaled();
  compacted.gate.noteWaiting(true);
  compacted.gate.noteCompacted(30_000);
  assert.equal(compacted.clock.size, 0);
  compacted.gate.noteWaiting(true);
  assert.equal(compacted.clock.size, 0);
  // 実行が終わった
  const stopped = signaled();
  stopped.gate.noteWaiting(true);
  stopped.gate.stop();
  assert.equal(stopped.clock.size, 0);
});

test("背中を押す: 足せなかった（入力が閉じている）ときは押したことにしない", () => {
  let open = false;
  const clock = fakeTimers();
  const nudged: string[] = [];
  const gate = createPreCompactGate({
    message: "指示",
    contextWindow: 200_000,
    contextTokens: 150_000,
    push: () => open,
    onSent: () => undefined,
    onNudged: (uuid) => nudged.push(uuid),
    newId: () => "id",
    timers: clock.timers,
  });
  open = true;
  gate.shouldBlock("auto", undefined);
  gate.noteReply(160_000, PRE_COMPACT_DONE);
  open = false;
  gate.noteWaiting(true);
  clock.fire();
  assert.equal(nudged.length, 0);
  // 次にまた止まったら押す
  open = true;
  gate.noteWaiting(true);
  clock.fire();
  assert.deepEqual(nudged, ["id"]);
});

test("背中を押す: 合図以外の理由で通したとき（残りが少ないなど）は押さない", () => {
  const { gate, clock } = setup({ contextTokens: 180_000 });
  assert.equal(gate.shouldBlock("auto", undefined), false);
  gate.noteWaiting(true);
  assert.equal(clock.size, 0);
});
