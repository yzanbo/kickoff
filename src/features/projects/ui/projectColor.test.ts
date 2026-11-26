import assert from "node:assert/strict";
import { test } from "vitest";
import { COMMON_TONE, projectTone } from "./projectColor";

test("projectTone: 共通は灰色のクラスを足し、どちらも色相を --hue で渡す", () => {
  assert.deepEqual(projectTone({ kind: "common", hue: 120 }), { className: COMMON_TONE, style: { "--hue": "120" } });
  assert.deepEqual(projectTone({ kind: null, hue: 30 }), { className: undefined, style: { "--hue": "30" } });
});
