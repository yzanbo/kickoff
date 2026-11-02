import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectSummary } from "../../core/types";
import { indexProjects } from "./projectsContext";

const project = (id: number, name: string) => ({ id, name }) as ProjectSummary;

test("indexProjects: ID から引け、名前が分からなければ空にする", () => {
  const index = indexProjects([project(1, "A"), project(2, "B")]);
  assert.equal(index.projectName(2), "B");
  assert.equal(index.projectName(9), "");
  assert.equal(index.projectsById.get(1)?.name, "A");
  assert.equal(index.projects.length, 2);
});
