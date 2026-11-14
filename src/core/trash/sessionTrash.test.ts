import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProviderId } from "@shared/types";
import { Store } from "../db/store.js";
import type { AgentProvider } from "../providers/types.js";
import { SESSION_SWEEP_GRACE_MS, sessionLabel, sweepUnusedSessions } from "./sessionTrash.js";

test("使われなくなったセッションの片付け: 覚えたもののうち、どのチャットも使わず、ほかの Kickoff も使わないものだけをゴミ箱へ入れて忘れる", async () => {
  const store = new Store(":memory:", () => {});
  const project = store.projects.create({ name: "p", repo_path: "/work/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, title: "c", provider: "claude", status: "completed" });
  // チャットに入れたセッションは覚える
  for (const id of ["gone", "shared", "kept"]) store.chats.update(chat.id, { session_id: id });
  assert.ok(store.agentSessions.has("gone"));
  // いまのチャットは kept を使っている。gone と shared はどのチャットも使っていない
  const put: { file: string; label?: string; projectId: number | null }[] = [];
  const provider = {
    sessionInfo: async (id: string) => ({ sessionId: id, file: `/claude/${id}.jsonl`, size: 1, modifiedAt: "", cwd: "/work/p", firstPrompt: "ログインを直して" }),
  } as unknown as AgentProvider;
  const deps = {
    store,
    providers: { claude: provider } as Record<ProviderId, AgentProvider>,
    trashBin: { putPath: async (file: string, opts: { projectId: number | null; label?: string }) => (put.push({ file, label: opts.label, projectId: opts.projectId }), {} as never) },
    sessionsElsewhere: (ids: string[]) => new Set(ids.filter((id) => id === "shared")),
  };
  // 覚えたばかりのものは見ない
  assert.equal(await sweepUnusedSessions(deps), 0);
  const later = () => Date.now() + SESSION_SWEEP_GRACE_MS + 1000;
  assert.equal(await sweepUnusedSessions({ ...deps, now: later }), 1);
  assert.deepEqual(put, [{ file: "/claude/gone.jsonl", label: "会話記録「ログインを直して」", projectId: project.id }]);
  assert.equal(store.agentSessions.has("gone"), false);
  // ほかの Kickoff が使うものは片付けず、覚えからだけ外す
  assert.equal(store.agentSessions.has("shared"), false);
  assert.ok(store.agentSessions.has("kept"));
});

test("ゴミ箱の名前: 最初の発言の 1 行目を 40 文字まで添える", () => {
  assert.equal(sessionLabel(null), "会話記録");
  assert.equal(sessionLabel("a".repeat(50) + "\n2 行目"), `会話記録「${"a".repeat(40)}…」`);
});
