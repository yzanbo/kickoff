import { test } from "vitest";
import assert from "node:assert/strict";
import { makeProject } from "@shared/projects/testing";
import { testTurn } from "@/foundation/core/testing/toolCalls";
import { isCommonChatProject, isCommonChatTurn } from "./projectScope";

test("isCommonChatTurn: 答えは isCommonChatProject と同じで、同じ作業の中では店を 1 回だけ引く", () => {
  const projects = new Map([makeProject(1, { kind: "common" }), makeProject(2)].map((p) => [p.id, p]));
  let reads = 0;
  const store = { get: (id: number) => (reads++, projects.get(id)) };
  for (const projectId of [1, 2, 3]) {
    const turn = testTurn({ projectId });
    const expected = isCommonChatProject(store, projectId);
    reads = 0;
    assert.equal(isCommonChatTurn(store, turn), expected);
    assert.equal(isCommonChatTurn(store, turn), expected);
    assert.equal(reads, 1);
  }
});
