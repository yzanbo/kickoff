import assert from "node:assert/strict";
import { test } from "vitest";
import { sendModeOf } from "./composerKeys";

const mods = (meta: boolean, shift: boolean) => ({ meta, shift });

test("sendModeOf: ⌘Enter = いま（tell）・⌘⇧Enter = あとで（queue）・⌘ なしは切り替えのとおり（undefined）", () => {
  assert.equal(sendModeOf(mods(true, false)), "tell");
  assert.equal(sendModeOf(mods(true, true)), "queue");
  assert.equal(sendModeOf(mods(false, false)), undefined);
  // Shift だけ（Shift+Enter は改行。送らないので送り方も決めない）
  assert.equal(sendModeOf(mods(false, true)), undefined);
});
