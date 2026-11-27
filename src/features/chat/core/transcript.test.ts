import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat, makeEvent } from "@shared/chat/testing";
import { makeProject } from "@shared/projects/testing";
import { chatTranscript, transcriptFileName } from "./transcript";

const chat = makeChat(1, { title: "ログイン画面の修正", branch: "main", created_at: "2026-11-04T01:00:00Z" });
const project = makeProject(1, { name: "Demo", repo_path: "/r" });

test("チャットの記録: 自分の発言・AI の返答を順に並べ、作業ごとに変えたファイルと失敗を添える（ツールの出力・サブエージェントの発言は入れない）", () => {
  const md = chatTranscript(chat, project, [
    makeEvent(1, "user", { text: "ボタンを直して", attachments: [{ kind: "file", id: "a", name: "画面.png", mime: "image/png", size: 1 }] }),
    makeEvent(2, "thinking", { text: "考え中" }),
    makeEvent(3, "tool_use", { id: "t1", name: "Edit", input: { file_path: "/r/src/Login.tsx" } }),
    makeEvent(4, "tool_result", { tool_use_id: "t1", content: "ok" }),
    makeEvent(5, "text", { text: "サブの返答", parent: "x" }),
    makeEvent(6, "text", { text: "直しました。" }),
    makeEvent(7, "result", { status: "completed" }),
    makeEvent(8, "user", { text: "次も" }),
    makeEvent(9, "result", { status: "failed", text: "API Error: 500" }),
  ]);
  assert.match(md, /^# チャット「ログイン画面の修正」の記録/);
  assert.match(md, /- プロジェクト: Demo（\/r・ブランチ main）/);
  assert.match(md, /## 自分（.+）\n\nボタンを直して\n\n（添付: 画面\.png）/);
  assert.match(md, /## AI\n\n直しました。\n\n（この作業で変えたファイル: src\/Login\.tsx）/);
  assert.match(md, /（作業は失敗しました: API Error: 500）/);
  assert.doesNotMatch(md, /サブの返答|考え中|ok/);
  // 変えたファイルは作業ごとに数え直す（2 回目の作業には添えない）
  assert.equal(md.match(/この作業で変えたファイル/g)?.length, 1);
  assert.equal(transcriptFileName({ ...chat, title: "a/b:c" }), "チャット履歴-a b c.md");
  // 添付にするときは断り書きを入れ、コピーするときは入れない
  assert.match(md, /参照のために書き出したもの/);
  const copied = chatTranscript(chat, project, [makeEvent(1, "user", { text: "ボタンを直して" })], { note: false });
  assert.doesNotMatch(copied, /参照のために書き出したもの/);
  assert.match(copied, /- 作成: .+\n\n## 自分（.+）\n\nボタンを直して\n$/);
});

test("チャットの記録: 変えたファイルには、成功した編集だけを数える（守り・承認で断られた・失敗した・結果が届かなかった呼び出しは入れない）", () => {
  const md = chatTranscript(chat, project, [
    makeEvent(1, "user", { text: "直して" }),
    makeEvent(2, "tool_use", { id: "ok", name: "Edit", input: { file_path: "/r/a.ts" } }),
    makeEvent(3, "tool_use", { id: "denied", name: "Write", input: { file_path: "/other/b.ts" } }),
    makeEvent(4, "tool_result", { tool_use_id: "denied", content: "共通のチャットからは…書き換えられません", is_error: true }),
    makeEvent(5, "tool_result", { tool_use_id: "ok", content: "The file /r/a.ts has been updated." }),
    // Codex の変更（当てられなかった）も同じ形で届く
    makeEvent(6, "tool_use", { id: "patch#0", name: "Edit", input: { file_path: "/r/c.ts" } }),
    makeEvent(7, "tool_result", { tool_use_id: "patch#0", content: "変更を当てられませんでした（declined）", is_error: true }),
    makeEvent(8, "tool_use", { id: "cut", name: "Edit", input: { file_path: "/r/d.ts" } }),
    makeEvent(9, "result", { status: "cancelled" }),
    makeEvent(10, "user", { text: "もう一度" }),
    // 前の作業で結果が届かなかった呼び出しの ID は、次の作業に持ち越さない
    makeEvent(11, "tool_result", { tool_use_id: "cut", content: "ok" }),
    makeEvent(12, "result", { status: "completed" }),
  ]);
  assert.match(md, /（この作業で変えたファイル: a\.ts）/);
  assert.doesNotMatch(md, /b\.ts|c\.ts|d\.ts/);
  assert.equal(md.match(/この作業で変えたファイル/g)?.length, 1);
});

test("チャットの記録: AI からの質問に答えた内容を、質問ごとに入れる（スキップは入れない）", () => {
  const md = chatTranscript(chat, project, [
    makeEvent(1, "approval_resolved", {
      approval_id: "x",
      action: "answer",
      kind: "question",
      answers: { "好きな色は？": "この色", "好きな季節は？": ["春", "秋"] },
      attachments: { "好きな色は？": [{ kind: "file", id: "a", name: "色.png", mime: "image/png", size: 1 }] },
    }),
    makeEvent(3, "approval_resolved", { approval_id: "z", action: "deny", kind: "question" }),
  ]);
  assert.match(md, /## 自分（質問への回答・.+）\n\n- 好きな色は？ → この色（添付: 色\.png）\n- 好きな季節は？ → 春、秋/);
  assert.equal(md.match(/質問への回答/g)?.length, 1);
});

test("チャットの記録: 承認を拒否したときに書いた理由を入れる（理由なしの拒否は入れない）", () => {
  const md = chatTranscript(chat, project, [
    makeEvent(1, "approval_resolved", {
      approval_id: "x",
      action: "deny",
      kind: "permission",
      message: "消さずに\n残して",
      attachments: [{ kind: "file", id: "a", name: "画面.png", mime: "image/png", size: 1 }],
    }),
    makeEvent(2, "approval_resolved", { approval_id: "y", action: "deny", kind: "permission" }),
  ]);
  assert.match(md, /## 自分（拒否の理由・.+）\n\n消さずに\n残して（添付: 画面\.png）/);
  assert.equal(md.match(/拒否の理由/g)?.length, 1);
});
