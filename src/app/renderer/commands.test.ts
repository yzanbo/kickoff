import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import type { CommandContext } from "@/foundation/ui/commands";
import { runCommandKey } from "@/foundation/ui/commands/commands";
import type { KeyInput } from "@/foundation/ui/lib/keys";
import { appCommands, historySteps } from "./commands";

const list = appCommands.map((c) => c.value);
const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput & { defaultPrevented: boolean } => ({ key: k, code: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false, ...mods });
const ctx = (window: "main" | "popout"): CommandContext => ({ window, route: null, projectId: null });

test("別ウィンドウの ⌘F・⌘⇧S はメインと同じ判定（Mac の ⌃F・⌃⇧S は入力欄に残す）", () => {
  assert.equal(runCommandKey(key("f", { ctrlKey: true }), ctx("popout"), "bubble", list, true), false);
  assert.equal(runCommandKey(key("s", { ctrlKey: true, shiftKey: true }), ctx("popout"), "bubble", list, true), false);
  assert.equal(runCommandKey(key("s", { metaKey: true, shiftKey: true }), ctx("popout"), "bubble", list, true), true);
});

test("ブラウザから開いたとき（Mac の外）は ⌘[ ⌘] を Ctrl で受ける", () => {
  const steps: number[] = [];
  onTestFinished(historySteps.add((step) => void steps.push(step)));
  assert.equal(runCommandKey(key("[", { ctrlKey: true }), ctx("main"), "bubble", list, false), true);
  assert.equal(runCommandKey(key("]", { ctrlKey: true }), ctx("main"), "bubble", list, false), true);
  assert.equal(runCommandKey(key("[", { metaKey: true }), ctx("main"), "bubble", list, false), false);
  assert.deepEqual(steps, [-1, 1]);
});
