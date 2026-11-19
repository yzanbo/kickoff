// 主な応答の形の記録: 値ではなく形（キーと型）だけを test-records/core/shapes/<名前>.json に残す。
// 取り決めへの乗せ替え・移動の段では変えない（変わってよいのは、分冊の手順に書いた欄だけ）
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { gitIn, gitRepo } from "@/foundation/core/testing/gitRepo";
import { matchRecord, shapeOf } from "@/foundation/core/testing/record";
import { setup } from "@/app/core/testing/testServer";

test("主な応答の形の記録（13 本）", async () => {
  const { call, store, project } = setup();
  // 本物の Git の作業場所（ステージした変更・ステージしていない変更・まだ Git にないファイル）
  gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n", "b.txt": "b\n" } });
  fs.writeFileSync(path.join(project.repo_path, "a.txt"), "a changed\n");
  fs.writeFileSync(path.join(project.repo_path, "b.txt"), "b changed\n");
  gitIn(project.repo_path)("add", "b.txt");
  fs.writeFileSync(path.join(project.repo_path, "new.txt"), "new\n");
  // チャット 2（1 つはグループに入れて固定）・記録 5・グループ 1・定型文 1・承認 0
  const group = store.groups.create(project.id, "グループ");
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "チャット", status: "completed" });
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "もう 1 つ", status: "completed", group_id: group.id });
  store.chats.setPinned(other.id, true);
  store.events.add(chat.id, { type: "user", text: "読んで", message_uuid: "u1" });
  store.events.add(chat.id, { type: "text", text: "読みます" });
  store.events.add(chat.id, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.txt" } });
  store.events.add(chat.id, { type: "tool_result", tool_use_id: "t1", content: "a", is_error: false });
  const end = store.events.add(chat.id, { type: "result", status: "completed", text: "読みました" });
  store.snippets.create({ project_id: null, label: "あいさつ", text: "こんにちは" });

  const routes: [name: string, url: string][] = [
    ["status", "/api/status"],
    ["settings", "/api/settings"],
    ["projects", "/api/projects"],
    ["project-chats", `/api/projects/${project.id}/chats`],
    ["chat-detail", `/api/chats/${chat.id}`],
    ["chat-events", `/api/chats/${chat.id}/events?before=${end.id + 1}&turns=10`],
    ["groups", `/api/projects/${project.id}/groups`],
    ["snippets", "/api/snippets"],
    ["providers", "/api/providers"],
    ["approvals", "/api/approvals"],
    ["restart-resumes", "/api/restart-resumes"],
    ["git-status", `/api/projects/${project.id}/git/status`],
    ["docker", `/api/projects/${project.id}/docker`],
  ];
  for (const [name, url] of routes) {
    const res = await call("GET", url);
    if (res.status !== 200) throw new Error(`${url} が ${res.status} を返しました: ${JSON.stringify(res.body)}`);
    await matchRecord(`core/shapes/${name}.json`, shapeOf(res.body));
  }
});
