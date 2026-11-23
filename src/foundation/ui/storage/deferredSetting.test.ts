import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import { deferredSetting } from "./deferredSetting";
import { defineSettings } from "./groups";
import { readSetting, text } from "./settings";

installMemoryStorage();
const { settings } = defineSettings("tDeferred", { draft: text() });

test("deferredSetting: 止まってから最後の値だけを書く。待っている間の pagehide でも書き出し、cancel は捨てる", () => {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  const win = new EventTarget();
  vi.stubGlobal("window", win);
  const draft = deferredSetting(settings.draft, 400);
  draft.write("a");
  draft.write("ab");
  vi.advanceTimersByTime(399);
  assert.equal(readSetting(settings.draft), "");
  vi.advanceTimersByTime(1);
  assert.equal(readSetting(settings.draft), "ab");
  draft.write("abc");
  win.dispatchEvent(new Event("pagehide"));
  assert.equal(readSetting(settings.draft), "abc");
  draft.write("abcd");
  draft.cancel();
  vi.advanceTimersByTime(1000);
  win.dispatchEvent(new Event("pagehide"));
  assert.equal(readSetting(settings.draft), "abc");
});
