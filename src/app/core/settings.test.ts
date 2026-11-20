import { test } from "vitest";
import assert from "node:assert/strict";
import { defaultsOf, entriesOf } from "@shared/foundation/contract/settings";
import { ALL_SETTINGS } from "@/app/shared/settings";
import { SETTING_SCHEMAS } from "./settings";

test("設定の束ね: 全部の項目に PUT の zod があり、並びも同じ。AI ごとに重ねるのは provider_chat_defaults だけ", () => {
  assert.deepEqual(Object.keys(SETTING_SCHEMAS), Object.keys(ALL_SETTINGS));
  assert.equal(Object.keys(ALL_SETTINGS).length, 31);
  assert.deepEqual(entriesOf(ALL_SETTINGS), ["provider_chat_defaults"]);
  // 既定の値は zod を通る
  for (const [key, value] of Object.entries(defaultsOf(ALL_SETTINGS))) {
    assert.ok(SETTING_SCHEMAS[key as keyof typeof SETTING_SCHEMAS].safeParse(value).success, key);
  }
});
