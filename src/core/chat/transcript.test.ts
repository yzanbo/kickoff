import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project, Chat, ChatEvent } from "@shared/types";
import { chatTranscript, transcriptFileName } from "./transcript.js";

const ev = (id: number, type: ChatEvent["type"], data: object): ChatEvent => ({ id, chat_id: 1, type, data, created_at: "2026-11-04T01:02:00Z" }) as unknown as ChatEvent;
const chat = { id: 1, title: "ログイン画面の修正", worktree_path: null, branch: "main", created_at: "2026-11-04T01:00:00Z" } as Chat;
const project = { name: "Demo", repo_path: "/r" } as Project;

test("チャットの記録: 自分の発言・AI の返答を順に並べ、作業ごとに変えたファイルと失敗を添える（ツールの出力・サブエージェントの発言は入れない）", () => {
  const md = chatTranscript(chat, project, [
    ev(1, "user", { text: "ボタンを直して", attachments: [{ id: "a", name: "画面.png", mime: "image/png", size: 1 }] }),
    ev(2, "thinking", { text: "考え中" }),
    ev(3, "tool_use", { id: "t1", name: "Edit", input: { file_path: "/r/src/Login.tsx" } }),
    ev(4, "tool_result", { tool_use_id: "t1", content: "ok" }),
    ev(5, "text", { text: "サブの返答", sub: true, parent: "x" }),
    ev(6, "text", { text: "直しました。" }),
    ev(7, "result", { status: "completed" }),
    ev(8, "user", { text: "次も" }),
    ev(9, "result", { status: "failed", text: "API Error: 500" }),
  ]);
  assert.match(md, /^# チャット「ログイン画面の修正」の記録/);
  assert.match(md, /- プロジェクト: Demo（\/r・ブランチ main）/);
  assert.match(md, /## 自分（.+）\n\nボタンを直して\n\n（添付: 画面\.png）/);
  assert.match(md, /## AI\n\n直しました。\n\n（この作業で変えたファイル: src\/Login\.tsx）/);
  assert.match(md, /（作業は失敗しました: API Error: 500）/);
  assert.doesNotMatch(md, /サブの返答|考え中|ok/);
  // 変えたファイルは作業ごとに数え直す（2 回目の作業には添えない）
  assert.equal(md.match(/この作業で変えたファイル/g)?.length, 1);
  assert.equal(transcriptFileName({ ...chat, title: "a/b:c" } as Chat), "チャット履歴-a b c.md");
});

test("チャットの記録: AI からの質問に答えた内容を、質問ごとに入れる（答えのない以前の記録・スキップは入れない）", () => {
  const md = chatTranscript(chat, project, [
    ev(1, "approval_resolved", {
      approval_id: "x",
      action: "answer",
      kind: "question",
      answers: { "好きな色は？": "この色", "好きな季節は？": ["春", "秋"] },
      attachments: { "好きな色は？": [{ id: "a", name: "色.png", mime: "image/png", size: 1 }] },
    }),
    ev(2, "approval_resolved", { approval_id: "y", action: "answer" }),
    ev(3, "approval_resolved", { approval_id: "z", action: "deny", kind: "question" }),
  ]);
  assert.match(md, /## 自分（質問への回答・.+）\n\n- 好きな色は？ → この色（添付: 色\.png）\n- 好きな季節は？ → 春、秋/);
  assert.equal(md.match(/質問への回答/g)?.length, 1);
});
