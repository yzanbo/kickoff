import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultResumeChoice, resumeActionsFor, resumeChoiceLabel } from "./restartResumeChoices";

test("起動したときの再開の確かめの選ぶもの: 送信待ちがあるか・途中で止まったかで選べる答えと名前を変え、初めは途中で止まったものは続ける", () => {
  assert.deepEqual(resumeActionsFor({ interrupted: true, queued: true }), ["send", "continue", "pause"]);
  assert.deepEqual(resumeActionsFor({ interrupted: false, queued: true }), ["send", "pause"]);
  assert.deepEqual(resumeActionsFor({ interrupted: true, queued: false }), ["continue", "pause"]);
  assert.equal(defaultResumeChoice({ interrupted: true }), "continue");
  assert.equal(defaultResumeChoice({ interrupted: false }), "send");
  assert.deepEqual(
    (["send", "continue", "pause", "later"] as const).map((c) => resumeChoiceLabel(c, true)),
    ["送る", "続けてから送る", "止めておく", "あとで"],
  );
  assert.deepEqual([resumeChoiceLabel("continue", false), resumeChoiceLabel("pause", false)], ["続ける", "止めたまま"]);
});
