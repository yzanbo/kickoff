import assert from "node:assert/strict";
import { test } from "vitest";
import { noteChatStartChoices, noteChatStartOf } from "./noteChatStartModel";

const ALPHA = { id: 2, name: "alpha" };

test("noteChatStartOf: プロジェクトのノートは、見ているプロジェクトによらずノートのプロジェクトに開く", () => {
  assert.deepEqual(noteChatStartOf({ noteProjectId: 3, commonNote: false, viewing: ALPHA }), { kind: "open", projectId: 3 });
  assert.deepEqual(noteChatStartOf({ noteProjectId: 3, commonNote: false, viewing: null }), { kind: "open", projectId: 3 });
});

test("noteChatStartOf: 共通のノートは、利用者のプロジェクトを見ていれば、そのプロジェクトか共通かを聞く", () => {
  assert.deepEqual(noteChatStartOf({ noteProjectId: 1, commonNote: true, viewing: ALPHA }), { kind: "ask", viewing: ALPHA, common: 1 });
});

test("noteChatStartOf: 共通のノートは、プロジェクトを見ていなければ（共通の画面・全ノートの画面）聞かずに共通に開く", () => {
  assert.deepEqual(noteChatStartOf({ noteProjectId: 1, commonNote: true, viewing: null }), { kind: "open", projectId: 1 });
});

test("noteChatStartChoices: 見ているプロジェクトの名前で始めるか、共通で始めるか", () => {
  assert.deepEqual(
    noteChatStartChoices("alpha").map((c) => c.label),
    ["alpha で始める", "共通で始める"],
  );
});
