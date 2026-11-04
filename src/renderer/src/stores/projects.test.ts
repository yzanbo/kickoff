import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "@shared/types";
import { indexProjects, reduceProjects } from "./projects";

const project = (id: number, name: string, position = 0) => ({ id, name, position }) as Project;

test("indexProjects: ID から引け、名前が分からなければ空にする", () => {
  const index = indexProjects([project(1, "A"), project(2, "B")]);
  assert.equal(index.projectName(2), "B");
  assert.equal(index.projectName(9), "");
  assert.equal(index.projectsById.get(1)?.name, "A");
  assert.equal(index.projects.length, 2);
});

test("reduceProjects: 作った・変えたプロジェクトは並び順（position → id）の位置へ、消したものは外す", () => {
  const list = [project(1, "A", 0), project(2, "B", 1)];
  assert.deepEqual(reduceProjects(list, { type: "project", project: project(3, "C", 0) }).map((p) => p.id), [1, 3, 2]);
  assert.deepEqual(reduceProjects(list, { type: "project", project: project(1, "A2", 5) }).map((p) => p.name), ["B", "A2"]);
  assert.deepEqual(reduceProjects(list, { type: "project_deleted", id: 1 }).map((p) => p.id), [2]);
  assert.equal(reduceProjects(list, { type: "project_deleted", id: 9 }), list);
  assert.equal(reduceProjects(list, { type: "group_deleted", id: 1, project_id: 1 }), list);
});
