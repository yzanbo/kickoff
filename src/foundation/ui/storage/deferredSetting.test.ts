import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createFakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import { deferredSetting } from "./deferredSetting";
import { defineSettings } from "./groups";
import { readSetting, text } from "./settings";

installMemoryStorage();
const { settings } = defineSettings("tDeferred", { draft: text() });

test("deferredSetting: 止まってから最後の値だけを書く。待っている間の pagehide でも書き出し、cancel は捨てる", () => {
  const clock = createFakeScheduler();
  const win = new EventTarget();
  vi.stubGlobal("window", win);
  const draft = deferredSetting(settings.draft, 400, clock);
  draft.write("a");
  draft.write("ab");
  clock.advance(399);
  assert.equal(readSetting(settings.draft), "");
  clock.advance(1);
  assert.equal(readSetting(settings.draft), "ab");
  draft.write("abc");
  win.dispatchEvent(new Event("pagehide"));
  assert.equal(readSetting(settings.draft), "abc");
  draft.write("abcd");
  draft.cancel();
  clock.advance(1000);
  win.dispatchEvent(new Event("pagehide"));
  assert.equal(readSetting(settings.draft), "abc");
});
