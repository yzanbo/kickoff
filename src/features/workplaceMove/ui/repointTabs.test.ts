import assert from "node:assert/strict";
import { test } from "vitest";
import { changesTab, databaseTab, fileTab, noteTab, projectViewTab } from "@/features/panel/ui/tabs/tabKinds";
import { repointPlan } from "./repointTabs";

test("作業場所を移したら、移す前の作業場所を指す右の欄のタブを付け替え、書きかけのファイルのタブは残す（メモの仕様書「0025」の H4）", () => {
  const at = { chatId: 1, projectId: 7 };
  const tabs = [
    changesTab({ ...at, focus: "a.ts" }),
    fileTab({ ...at, path: "a.ts", line: 3 }),
    fileTab({ ...at, path: "dirty.ts" }),
    projectViewTab({ ...at, view: "files" }),
    databaseTab(at),
    noteTab({ ...at, path: "m.md" }),
    // ほかの作業場所・ほかのチャットのタブは触らない
    changesTab({ ...at, worktree: "/wt/other" }),
    fileTab({ chatId: 2, projectId: 7, path: "a.ts" }),
  ];
  const plan = repointPlan(tabs, 1, { project_id: 7, worktree_path: null }, { project_id: 7, worktree_path: "/wt/feat" }, (key) => key === "file::dirty.ts");
  assert.deepEqual(
    plan.replace.map(([old, t]) => [old, t.key, "worktree" in t ? t.worktree : undefined]),
    [
      ["changes:", "changes:/wt/feat", "/wt/feat"],
      ["file::a.ts", "file:/wt/feat:a.ts", "/wt/feat"],
      ["project-view:files", "project-view:files", "/wt/feat"],
      ["database", "database", "/wt/feat"],
    ],
  );
  assert.deepEqual(plan.kept, ["dirty.ts"]);
  // 行・移る先のファイルは引き継ぐ
  const file = plan.replace[1][1];
  assert.equal(file.kind === "file" ? file.line : null, 3);
  const changes = plan.replace[0][1];
  assert.equal(changes.kind === "changes" ? changes.focus : null, "a.ts");
});
