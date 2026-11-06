import assert from "node:assert/strict";
import { test } from "node:test";
import { PRE_COMPACT_DONE } from "@shared/chat/prompts";
import { createPreCompactGate, replyText } from "./preCompact.js";

/** ウィンドウ 200k・始めの大きさ 150k のゲートと、足した発言の記録 */
function setup(opts: { contextTokens?: number | null; push?: boolean } = {}) {
  const pushed: string[] = [];
  const sent: string[] = [];
  const gate = createPreCompactGate({
    message: "指示",
    contextWindow: 200_000,
    contextTokens: opts.contextTokens === undefined ? 150_000 : opts.contextTokens,
    push: (text, uuid) => {
      pushed.push(`${uuid}:${text}`);
      return opts.push ?? true;
    },
    onSent: (uuid) => sent.push(uuid),
    newId: () => `id${pushed.length + 1}`,
  });
  return { gate, pushed, sent };
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
