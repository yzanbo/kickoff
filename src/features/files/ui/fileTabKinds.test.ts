import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { fileTab } from "@/features/panel/ui";
import { fileTabKind } from "./fileTabKinds";
import { registerUnsaved } from "@/foundation/ui/document/unsaved";
import { fileTabPlace } from "./fileTabs";

// 中身・アイコンの部品（エディタ）は読まない（付け替えの決まりだけを確かめる）
vi.mock("./fileTabPages", () => Object.fromEntries(["FilePage", "ProjectFilePage", "ProjectFileFace"].map((name) => [name, () => null])));
vi.mock("./FileTabLead", () => ({ FileTabLead: () => null }));

const move = { chatId: 1, from: { projectId: 7, worktree: null }, to: { projectId: 7, worktree: "/wt/feat" } };

test("作業場所を移したら、右の欄のファイルのタブは新しい作業場所の同じファイル（行も）にし、保存していなければ残す・ほかの作業場所のタブは触らない", () => {
  const panel = "agents:1";
  const file = fileTab({ chatId: 1, projectId: 7, path: "a.ts", line: 3 });
  assert.deepEqual(fileTabKind.repoint?.(file, move, panel), fileTab({ chatId: 1, projectId: 7, worktree: "/wt/feat", path: "a.ts", line: 3 }));
  const dirty = fileTab({ chatId: 1, projectId: 7, path: "dirty.ts" });
  onTestFinished(registerUnsaved({ key: "7::dirty.ts", surface: "agents", title: "dirty.ts", dirty: () => true, save: async () => true, tab: fileTabPlace(panel, dirty.key) }));
  assert.deepEqual(fileTabKind.repoint?.(dirty, move, panel), { kept: "dirty.ts" });
  assert.equal(fileTabKind.repoint?.(fileTab({ chatId: 1, projectId: 7, worktree: "/wt/other", path: "a.ts" }), move, panel), null);
  assert.equal(fileTabKind.repoint?.(fileTab({ chatId: 2, projectId: 7, path: "a.ts" }), move, panel), null);
});
