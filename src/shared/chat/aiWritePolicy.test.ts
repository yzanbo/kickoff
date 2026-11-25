import assert from "node:assert/strict";
import { test } from "vitest";
import { AI_CREATE_CHAT_MODES, AI_WRITE_OTHER_PROJECTS_MODES } from "@shared/settings/types";
import { aiWriteOffText, aiWritePolicy, aiWriteRememberText } from "./aiWritePolicy";

const settings = (ai_create_chat: (typeof AI_CREATE_CHAT_MODES)[number], ai_write_other_projects: (typeof AI_WRITE_OTHER_PROJECTS_MODES)[number]) => ({ ai_create_chat, ai_write_other_projects });

test("aiWritePolicy: 自分のプロジェクトの中でチャットを作るときは「AI がチャットを作るとき」だけが効く", () => {
  for (const other of AI_WRITE_OTHER_PROJECTS_MODES) {
    assert.deepEqual(aiWritePolicy(settings("ask", other), "own_chat"), { setting: "ai_create_chat", mode: "ask" });
    assert.deepEqual(aiWritePolicy(settings("allow", other), "own_chat"), { setting: "ai_create_chat", mode: "allow" });
    assert.deepEqual(aiWritePolicy(settings("off", other), "own_chat"), { setting: "ai_create_chat", mode: "off" });
  }
});

test("aiWritePolicy: 共通のチャットがほかのプロジェクトにチャットを作るときは新しい設定だけが効く", () => {
  assert.deepEqual(aiWritePolicy(settings("allow", "ask"), "other_project_chat"), { setting: "ai_write_other_projects", mode: "ask" });
  assert.deepEqual(aiWritePolicy(settings("ask", "allow"), "other_project_chat"), { setting: "ai_write_other_projects", mode: "allow" });
  assert.deepEqual(aiWritePolicy(settings("ask", "off"), "other_project_chat"), { setting: "ai_write_other_projects", mode: "off" });
});

test("aiWritePolicy: 「作らせない」ならほかのプロジェクトにもチャットを作らない（止めているのは「AI がチャットを作るとき」）", () => {
  for (const other of AI_WRITE_OTHER_PROJECTS_MODES) {
    assert.deepEqual(aiWritePolicy(settings("off", other), "other_project_chat"), { setting: "ai_create_chat", mode: "off" });
  }
});

test("aiWritePolicy: ほかのプロジェクトのチャット・ノートを変えるときは新しい設定だけ（「作らせない」でもチャットを作らないなら止めない）", () => {
  for (const create of AI_CREATE_CHAT_MODES) {
    for (const other of AI_WRITE_OTHER_PROJECTS_MODES) {
      assert.deepEqual(aiWritePolicy(settings(create, other), "other_project_write"), { setting: "ai_write_other_projects", mode: other });
    }
  }
});

test("aiWriteOffText・aiWriteRememberText: 効いた設定の名前を出す", () => {
  assert.match(aiWriteOffText("ai_create_chat"), /「AI がチャットを作るとき」/);
  assert.match(aiWriteOffText("ai_write_other_projects"), /「共通のチャットがほかのプロジェクトに書くとき」/);
  assert.match(aiWriteRememberText("ai_create_chat"), /聞かずに作ります.*「AI がチャットを作るとき」/);
  assert.match(aiWriteRememberText("ai_write_other_projects"), /聞かずに書きます.*「共通のチャットがほかのプロジェクトに書くとき」/);
});
