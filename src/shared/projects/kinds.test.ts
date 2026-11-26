import assert from "node:assert/strict";
import { test } from "vitest";
import { makeProject } from "./testing";
import { hasUserProjects, isActiveProject, isActiveUserProject, isCommonProject, isCommonProjectIn, isUserProject, projectOwnerLabel } from "./kinds";

const ARCHIVED = { archived_at: "2026-01-01T00:00:00.000Z" };

test("isUserProject: 種類のない、利用者が作ったプロジェクトだけ（共通は外す）", () => {
  assert.equal(isUserProject(makeProject(1)), true);
  assert.equal(isUserProject(makeProject(2, ARCHIVED)), true);
  assert.equal(isUserProject(makeProject(3, { kind: "common" })), false);
});

test("isActiveProject・isActiveUserProject: アーカイブしていないものだけを選ぶ（isActiveProject は共通も）", () => {
  assert.equal(isActiveUserProject(makeProject(1)), true);
  assert.equal(isActiveUserProject(makeProject(2, ARCHIVED)), false);
  assert.equal(isActiveUserProject(makeProject(3, { kind: "common" })), false);
  assert.equal(isActiveProject(makeProject(1)), true);
  assert.equal(isActiveProject(makeProject(2, ARCHIVED)), false);
  assert.equal(isActiveProject(makeProject(3, { kind: "common" })), true);
});

test("isCommonProject: 種類が共通のものだけ", () => {
  assert.equal(isCommonProject(makeProject(1)), false);
  assert.equal(isCommonProject(makeProject(2, { kind: "common" })), true);
});

test("isCommonProjectIn: 一覧の中の共通の ID だけ（一覧にない ID は共通でない）", () => {
  const projects = [makeProject(1), makeProject(2, { kind: "common" })];
  assert.equal(isCommonProjectIn(projects, 2), true);
  assert.equal(isCommonProjectIn(projects, 1), false);
  assert.equal(isCommonProjectIn(projects, 3), false);
  assert.equal(isCommonProjectIn([], 2), false);
});

test("hasUserProjects: 利用者が作ったプロジェクトがあるか（アーカイブしたものも数え、共通は数えない）", () => {
  assert.equal(hasUserProjects([makeProject(1, { kind: "common" })]), false);
  assert.equal(hasUserProjects([makeProject(1, { kind: "common" }), makeProject(2, ARCHIVED)]), true);
  assert.equal(hasUserProjects([]), false);
});

test("projectOwnerLabel: 共通なら「共通」、ほかは「このプロジェクト」", () => {
  assert.equal(projectOwnerLabel(true), "共通");
  assert.equal(projectOwnerLabel(false), "このプロジェクト");
});
