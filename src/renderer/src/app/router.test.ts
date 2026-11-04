import assert from "node:assert/strict";
import { test } from "node:test";
import { href, parse, routeProjectId, type Route } from "./router";

test("parse: ハッシュを画面に読む（タブなしはボード、知らないタブはボード、知らない形は全プロジェクト）", () => {
  assert.deepEqual(parse(""), { name: "allProjects" });
  assert.deepEqual(parse("#/"), { name: "allProjects" });
  assert.deepEqual(parse("#/nowhere"), { name: "allProjects" });
  assert.deepEqual(parse("#/projects/3"), { name: "project", id: 3, tab: "board" });
  assert.deepEqual(parse("#/projects/3/changes"), { name: "project", id: 3, tab: "changes" });
  assert.deepEqual(parse("#/projects/3/history"), { name: "project", id: 3, tab: "history" });
  assert.deepEqual(parse("#/projects/3/unknown"), { name: "project", id: 3, tab: "board" });
  // なくした要件定義書・スケジュール・タスク・レポートのタブは、ボードに戻る
  for (const tab of ["requirements", "schedule", "tasks", "reports"]) {
    assert.deepEqual(parse(`#/projects/3/${tab}`), { name: "project", id: 3, tab: "board" }, tab);
  }
  // グループは「グループ」のタブでだけ読む（0 や数でないものは無視）
  assert.deepEqual(parse("#/projects/3/groups?group=7"), { name: "project", id: 3, tab: "groups", group: 7 });
  assert.deepEqual(parse("#/projects/3/groups?group=0"), { name: "project", id: 3, tab: "groups" });
  assert.deepEqual(parse("#/projects/3/changes?group=7"), { name: "project", id: 3, tab: "changes" });
});

test("parse: エディタタブで開くファイル（エディタタブでだけ読む。行は 1 以上の整数だけ）", () => {
  assert.deepEqual(parse("#/projects/3/changes?file=src%2Fa.ts&line=12&worktree=%2Fw%2Fx"), {
    name: "project",
    id: 3,
    tab: "changes",
    file: { path: "src/a.ts", line: 12, worktree: "/w/x" },
  });
  assert.deepEqual(parse("#/projects/3/changes?file=a.ts&line=0"), { name: "project", id: 3, tab: "changes", file: { path: "a.ts" } });
  assert.deepEqual(parse("#/projects/3/changes?line=4"), { name: "project", id: 3, tab: "changes" });
  assert.deepEqual(parse("#/projects/3/groups?file=a.ts"), { name: "project", id: 3, tab: "groups" });
});

test("parse: 新しいチャット（以前の section は読まない）とチャット（focus は 0 なら付けない）", () => {
  assert.deepEqual(parse("#/projects/3/new"), { name: "newChat", projectId: 3 });
  assert.deepEqual(parse("#/projects/3/new?section=requirements&group=2"), { name: "newChat", projectId: 3, group: 2 });
  assert.deepEqual(parse("#/projects/3/runs/12"), { name: "run", projectId: 3, runId: 12 });
  assert.deepEqual(parse("#/projects/3/runs/12?event=99"), { name: "run", projectId: 3, runId: 12, focus: 99 });
  assert.deepEqual(parse("#/projects/3/runs/12?event=0"), { name: "run", projectId: 3, runId: 12 });
});

test("href と parse の往復: 画面 → URL → 画面で同じになる", () => {
  const routes: Route[] = [
    { name: "allProjects" },
    { name: "project", id: 1, tab: "board" },
    { name: "project", id: 1, tab: "changes" },
    { name: "project", id: 1, tab: "history" },
    { name: "project", id: 1, tab: "groups", group: 5 },
    { name: "project", id: 1, tab: "changes", file: { path: "src/a b.ts", line: 3, worktree: "/x/app-worktrees/w" } },
    { name: "project", id: 1, tab: "changes", file: { path: "README.md" } },
    { name: "newChat", projectId: 2, group: 4 },
    { name: "run", projectId: 2, runId: 30 },
    { name: "run", projectId: 2, runId: 30, focus: 8 },
  ];
  for (const route of routes) {
    assert.deepEqual(parse(href(route)), route, href(route));
  }
  assert.equal(href({ name: "project", id: 1, tab: "board" }), "#/projects/1");
  assert.equal(href({ name: "newChat", projectId: 2 }), "#/projects/2/new");
});

test("routeProjectId: プロジェクトの画面・新しいチャット・チャットはそのプロジェクト、全プロジェクトは undefined", () => {
  assert.equal(routeProjectId({ name: "project", id: 4, tab: "board" }), 4);
  assert.equal(routeProjectId({ name: "newChat", projectId: 5 }), 5);
  assert.equal(routeProjectId({ name: "run", projectId: 6, runId: 1 }), 6);
  assert.equal(routeProjectId({ name: "allProjects" }), undefined);
});
