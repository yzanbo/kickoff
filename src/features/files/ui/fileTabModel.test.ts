import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { fileTab } from "@/features/panel/ui";
import { repointFileTab } from "./fileTabModel";
import { registerUnsaved } from "@/foundation/ui/document/unsaved";
import { fileTabPlace } from "./fileTabs";

const move = { chatId: 1, from: { projectId: 7, worktree: null }, to: { projectId: 7, worktree: "/wt/feat" } };

test("作業場所を移したら、右の欄のファイルのタブは新しい作業場所の同じファイル（行も）にし、保存していなければ残す・ほかの作業場所のタブは触らない", () => {
  const panel = "agents:1";
  const file = fileTab({ chatId: 1, projectId: 7, path: "a.ts", line: 3 });
  assert.deepEqual(repointFileTab(file, move, panel), fileTab({ chatId: 1, projectId: 7, worktree: "/wt/feat", path: "a.ts", line: 3 }));
  const dirty = fileTab({ chatId: 1, projectId: 7, path: "dirty.ts" });
  onTestFinished(registerUnsaved({ key: "7::dirty.ts", surface: "agents", title: "dirty.ts", dirty: () => true, save: async () => true, tab: fileTabPlace(panel, dirty.key) }));
  assert.deepEqual(repointFileTab(dirty, move, panel), { kept: "dirty.ts" });
  assert.equal(repointFileTab(fileTab({ chatId: 1, projectId: 7, worktree: "/wt/other", path: "a.ts" }), move, panel), null);
  assert.equal(repointFileTab(fileTab({ chatId: 2, projectId: 7, path: "a.ts" }), move, panel), null);
});
