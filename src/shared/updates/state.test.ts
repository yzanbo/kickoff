import assert from "node:assert/strict";
import { test } from "vitest";
import type { UpdateState } from "./types";
import { blocksCheck, checkDisabled, updateVersionOf } from "./state";

const all: UpdateState[] = [
  { kind: "idle" },
  { kind: "checking", previous: { kind: "idle" } },
  { kind: "latest" },
  { kind: "unreachable" },
  { kind: "downloading", version: "1.0.1", percent: 0 },
  { kind: "ready", version: "1.0.1" },
  { kind: "waiting", version: "1.0.1", running: 1 },
  { kind: "installing", version: "1.0.1" },
  { kind: "failed", version: "1.0.1" },
];
const kinds = (pick: (s: UpdateState) => boolean) => all.filter(pick).map((s) => s.kind);

test("blocksCheck・checkDisabled: ダウンロード中・待っている・入れている間は確かめず、確かめている間はボタンも押せない", () => {
  assert.deepEqual(kinds(blocksCheck), ["downloading", "waiting", "installing"]);
  assert.deepEqual(kinds(checkDisabled), ["checking", "downloading", "waiting", "installing"]);
});

test("updateVersionOf: 新しい版を持つ様子だけが版を返す", () => {
  assert.deepEqual(all.map(updateVersionOf), [null, null, null, null, "1.0.1", "1.0.1", "1.0.1", "1.0.1", "1.0.1"]);
});
