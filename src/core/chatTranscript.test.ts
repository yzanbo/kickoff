import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project, Run, RunEvent } from "./types.js";
import { chatTranscript, transcriptFileName } from "./chatTranscript.js";

const ev = (id: number, type: RunEvent["type"], data: object): RunEvent => ({ id, run_id: 1, type, data, created_at: "2026-11-04T01:02:00Z" }) as unknown as RunEvent;
const run = { id: 1, title: "ログイン画面の修正", worktree_path: "", branch: "main", created_at: "2026-11-04T01:00:00Z" } as Run;
const project = { name: "Demo", repo_path: "/r" } as Project;

test("チャットの記録: 自分の発言・AI の返答を順に並べ、作業ごとに変えたファイルと失敗を添える（ツールの出力・サブエージェントの発言は入れない）", () => {
  const md = chatTranscript(run, project, [
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
  assert.equal(transcriptFileName({ ...run, title: "a/b:c" } as Run), "チャット-a b c.md");
});
