import assert from "node:assert/strict";
import { test } from "vitest";
import { makeProject } from "./testing";
import { isActiveListedProject, isActiveUserProject, isCommonProject, isListedProject, isUserProject } from "./kinds";

const ARCHIVED = { archived_at: "2026-01-01T00:00:00.000Z" };

test("isUserProject: 種類のない、利用者が作ったプロジェクトだけ（共通は外す）", () => {
  assert.equal(isUserProject(makeProject(1)), true);
  assert.equal(isUserProject(makeProject(2, ARCHIVED)), true);
  assert.equal(isUserProject(makeProject(3, { kind: "common" })), false);
});

test("isListedProject: 一覧に並べるのは、利用者が作ったプロジェクトと共通", () => {
  assert.equal(isListedProject(makeProject(1)), true);
  assert.equal(isListedProject(makeProject(2, ARCHIVED)), true);
  assert.equal(isListedProject(makeProject(3, { kind: "common" })), true);
});

test("isActiveUserProject・isActiveListedProject: それぞれから、アーカイブしていないものだけを選ぶ", () => {
  assert.equal(isActiveUserProject(makeProject(1)), true);
  assert.equal(isActiveUserProject(makeProject(2, ARCHIVED)), false);
  assert.equal(isActiveUserProject(makeProject(3, { kind: "common" })), false);
  assert.equal(isActiveListedProject(makeProject(1)), true);
  assert.equal(isActiveListedProject(makeProject(2, ARCHIVED)), false);
  assert.equal(isActiveListedProject(makeProject(3, { kind: "common" })), true);
});

test("isCommonProject: 種類が共通のものだけ", () => {
  assert.equal(isCommonProject(makeProject(1)), false);
  assert.equal(isCommonProject(makeProject(2, { kind: "common" })), true);
});
