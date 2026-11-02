import assert from "node:assert/strict";
import { test } from "node:test";
import { href, parse, routeProjectId, type Route } from "./router";

test("parse: ハッシュを画面に読む（タブなしはボード、知らないタブはボード、知らない形は全プロジェクト）", () => {
  assert.deepEqual(parse(""), { name: "allProjects" });
  assert.deepEqual(parse("#/"), { name: "allProjects" });
  assert.deepEqual(parse("#/nowhere"), { name: "allProjects" });
  assert.deepEqual(parse("#/projects/3"), { name: "project", id: 3, tab: "board" });
  assert.deepEqual(parse("#/projects/3/tasks"), { name: "project", id: 3, tab: "tasks" });
  assert.deepEqual(parse("#/projects/3/unknown"), { name: "project", id: 3, tab: "board" });
  // グループは「グループ」のタブでだけ読む（0 や数でないものは無視）
  assert.deepEqual(parse("#/projects/3/groups?group=7"), { name: "project", id: 3, tab: "groups", group: 7 });
  assert.deepEqual(parse("#/projects/3/groups?group=0"), { name: "project", id: 3, tab: "groups" });
  assert.deepEqual(parse("#/projects/3/tasks?group=7"), { name: "project", id: 3, tab: "tasks" });
});

test("parse: 新しいチャット（セクションは知っているものだけ）とチャット（focus は 0 なら付けない）", () => {
  assert.deepEqual(parse("#/projects/3/new"), { name: "newChat", projectId: 3, section: undefined });
  assert.deepEqual(parse("#/projects/3/new?section=requirements&group=2"), { name: "newChat", projectId: 3, section: "requirements", group: 2 });
  assert.deepEqual(parse("#/projects/3/new?section=bogus"), { name: "newChat", projectId: 3, section: undefined });
  assert.deepEqual(parse("#/projects/3/runs/12"), { name: "run", projectId: 3, runId: 12 });
  assert.deepEqual(parse("#/projects/3/runs/12?event=99"), { name: "run", projectId: 3, runId: 12, focus: 99 });
  assert.deepEqual(parse("#/projects/3/runs/12?event=0"), { name: "run", projectId: 3, runId: 12 });
});

test("href と parse の往復: 画面 → URL → 画面で同じになる", () => {
  const routes: Route[] = [
    { name: "allProjects" },
    { name: "project", id: 1, tab: "board" },
    { name: "project", id: 1, tab: "changes" },
    { name: "project", id: 1, tab: "groups", group: 5 },
    { name: "newChat", projectId: 2, section: "schedule", group: 4 },
    { name: "run", projectId: 2, runId: 30 },
    { name: "run", projectId: 2, runId: 30, focus: 8 },
  ];
  for (const route of routes) {
    const back = parse(href(route));
    // newChat は section を常に持つ（なければ undefined）ので、キーの有無ではなく値で比べる
    assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(route)), href(route));
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
