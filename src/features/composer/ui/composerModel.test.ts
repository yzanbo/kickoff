import assert from "node:assert/strict";
import { test } from "vitest";
import { composerModel } from "./composerModel";

const idle = { text: "", attachments: 0, uploading: false, sending: false, busy: false, holdsQueue: false, recording: false };

test("composerModel: 書いているか添付があれば送れる（空白だけは送れない）", () => {
  assert.equal(composerModel(idle).canSend, false);
  assert.equal(composerModel({ ...idle, text: "  " }).canSend, false);
  assert.equal(composerModel({ ...idle, text: "a" }).canSend, true);
  assert.equal(composerModel({ ...idle, attachments: 1 }).canSend, true);
});

test("composerModel: 録音中は空でも送れる（起こした文を入れてから送る）が、ほかの送り先には送らない", () => {
  const m = composerModel({ ...idle, recording: true, text: "a" });
  assert.equal(composerModel({ ...idle, recording: true }).canSend, true);
  assert.equal(m.viaReady, false);
});

test("composerModel: アップロードの途中・送っている途中は送らない", () => {
  assert.equal(composerModel({ ...idle, text: "a", uploading: true }).canSend, false);
  assert.equal(composerModel({ ...idle, text: "a", sending: true }).viaReady, false);
});

test("composerModel: 作業中・止めている送信待ちがあるときは送り方を選ぶ（作業中でも送れる）", () => {
  assert.equal(composerModel(idle).queueing, false);
  assert.equal(composerModel({ ...idle, busy: true }).queueing, true);
  assert.equal(composerModel({ ...idle, holdsQueue: true }).queueing, true);
  assert.equal(composerModel({ ...idle, busy: true, text: "a" }).canSend, true);
});
