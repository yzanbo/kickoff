import { test } from "vitest";
import assert from "node:assert/strict";
import { allNotesFoldKey, allNotesMoveTargets, allNotesSections } from "./allNotesModel";

const projects = [
  { id: 3, name: "アプリ" },
  { id: 1, name: "メモ帳" },
];

test("allNotesSections: いちばん上に共通のノート（開く）、その下にプロジェクトを渡した順で（閉じる）", () => {
  const sections = allNotesSections({ projectId: 9, title: "共通のノート" }, projects);
  assert.deepEqual(
    sections.map((s) => [s.projectId, s.title, s.common, s.foldKey, s.defaultOpen]),
    [
      [9, "共通のノート", true, "common", true],
      [3, "アプリ", false, "p3", false],
      [1, "メモ帳", false, "p1", false],
    ],
  );
});

test("allNotesSections: 共通のノートが使えなければプロジェクトだけ、プロジェクトがなければ共通のノートだけ", () => {
  assert.deepEqual(
    allNotesSections(null, projects).map((s) => s.projectId),
    [3, 1],
  );
  assert.deepEqual(
    allNotesSections({ projectId: 9, title: "共通のノート" }, []).map((s) => s.projectId),
    [9],
  );
});

test("allNotesMoveTargets: 自分の欄を除いたすべての欄（共通のノートとプロジェクトで文を分ける）", () => {
  const sections = allNotesSections({ projectId: 9, title: "共通のノート" }, projects);
  assert.deepEqual(allNotesMoveTargets(sections, 3), [
    { projectId: 9, name: "共通のノート", label: "共通のノートへ移す" },
    { projectId: 1, name: "メモ帳", label: "「メモ帳」のノートへ移す" },
  ]);
  assert.deepEqual(
    allNotesMoveTargets(sections, 9).map((t) => t.projectId),
    [3, 1],
  );
});

test("allNotesFoldKey: 共通のノートは 1 つのキー、プロジェクトは id ごと", () => {
  assert.equal(allNotesFoldKey(9, true), "common");
  assert.equal(allNotesFoldKey(3, false), "p3");
});
