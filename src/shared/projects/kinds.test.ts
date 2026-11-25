import assert from "node:assert/strict";
import { test } from "vitest";
import { makeProject } from "./testing";
import { isActiveListedProject, isListedProject } from "./kinds";

test("isListedProject: 種類のないふつうのプロジェクトだけを一覧に並べ、見えないプロジェクト（共通のノート）は外す", () => {
  assert.equal(isListedProject(makeProject(1)), true);
  assert.equal(isListedProject(makeProject(2, { archived_at: "2026-01-01T00:00:00.000Z" })), true);
  assert.equal(isListedProject(makeProject(3, { kind: "common" })), false);
});

test("isActiveListedProject: 一覧に出すプロジェクトから、アーカイブしていないものだけを選ぶ", () => {
  assert.equal(isActiveListedProject(makeProject(1)), true);
  assert.equal(isActiveListedProject(makeProject(2, { archived_at: "2026-01-01T00:00:00.000Z" })), false);
  assert.equal(isActiveListedProject(makeProject(3, { kind: "common" })), false);
});
