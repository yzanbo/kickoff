import assert from "node:assert/strict";
import { test } from "vitest";
import { scopeLabel, snippetScopes } from "./snippetScopes";

const projects = [
  { id: 1, name: "web" },
  { id: 2, name: "api" },
];
const commonId = 9;

test("定型文の範囲の選択肢: アプリの設定は すべてのプロジェクト・共通・各プロジェクト、プロジェクト・共通の中は 2 つ", () => {
  assert.deepEqual(snippetScopes(null, { commonId, projects }), [
    { value: null, label: "すべてのプロジェクト" },
    { value: 9, label: "共通" },
    { value: 1, label: "web" },
    { value: 2, label: "api" },
  ]);
  // 共通が使えないときは選択肢に出さない
  assert.deepEqual(snippetScopes(null, { commonId: null, projects }).map((s) => s.label), ["すべてのプロジェクト", "web", "api"]);
  assert.deepEqual(snippetScopes(1, { commonId, projects }), [
    { value: null, label: "すべてのプロジェクト" },
    { value: 1, label: "このプロジェクトだけ" },
  ]);
  assert.deepEqual(snippetScopes(9, { commonId, projects }), [
    { value: null, label: "すべてのプロジェクト" },
    { value: 9, label: "共通だけ" },
  ]);
});

test("定型文の範囲の札: null は「すべて」、共通の id は「共通」（共通の画面の中でも）、開いているプロジェクトは「このプロジェクト」", () => {
  const nameOf = (id: number) => projects.find((p) => p.id === id)?.name;
  const label = (project_id: number | null, here: number | null) => scopeLabel({ project_id }, { commonId, here, nameOf });
  assert.equal(label(null, null), "すべて");
  assert.equal(label(null, 1), "すべて");
  assert.equal(label(9, null), "共通");
  assert.equal(label(9, 9), "共通");
  assert.equal(label(1, 1), "このプロジェクト");
  assert.equal(label(2, 1), "api");
  assert.equal(label(5, null), "もうないプロジェクト");
});
