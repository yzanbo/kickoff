import assert from "node:assert/strict";
import { test } from "vitest";
import { changesTab, fileTab, noteTab, type PanelTab } from "@/features/panel/ui";
import { repointPlan } from "./repointTabs";

test("作業場所を移したら、種類の repoint が返したタブに付け替え、書きかけで残したタブの名前を集める（メモの仕様書「0025」の H4）", () => {
  const at = { chatId: 1, projectId: 7 };
  const changes = changesTab(at);
  const dirty = fileTab({ ...at, path: "dirty.ts" });
  const note = noteTab({ ...at, path: "m.md" });
  const moved = changesTab({ ...at, worktree: "/wt/feat" });
  const repoint = (t: PanelTab) => (t === changes ? moved : t === dirty ? { kept: "dirty.ts" } : null);
  const plan = repointPlan([changes, dirty, note], repoint);
  assert.deepEqual(plan.replace, [[changes.key, moved]]);
  assert.deepEqual(plan.kept, ["dirty.ts"]);
});
