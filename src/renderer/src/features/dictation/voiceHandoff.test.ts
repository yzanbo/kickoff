import assert from "node:assert/strict";
import { test } from "node:test";
import { armVoiceHandoff, claimVoiceHandoff, disarmVoiceHandoff, returnVoiceHandoff, takeVoiceHandoff } from "./voiceHandoff";

test("音声モードの引き継ぎ: 印を付けて送ったときだけ、できたチャットが一度だけ受け取る", () => {
  // 印がなければ、チャットを作っても引き継がない
  claimVoiceHandoff(1);
  assert.equal(takeVoiceHandoff(1), false);
  armVoiceHandoff();
  claimVoiceHandoff(2);
  assert.equal(takeVoiceHandoff(1), false);
  assert.equal(takeVoiceHandoff(2), true);
  assert.equal(takeVoiceHandoff(2), false);
});

test("音声モードの引き継ぎ: 送る前に終えたら引き継がず、すぐ作り直されたら戻して受け取り直す", () => {
  armVoiceHandoff();
  disarmVoiceHandoff();
  claimVoiceHandoff(3);
  assert.equal(takeVoiceHandoff(3), false);
  armVoiceHandoff();
  claimVoiceHandoff(4);
  assert.equal(takeVoiceHandoff(4), true);
  returnVoiceHandoff(4);
  assert.equal(takeVoiceHandoff(4), true);
});
