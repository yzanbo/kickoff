// 作業場所のファイル・差分を開くツール（files の open_file・git の open_diff）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import { testStore } from "@/app/core/testing/testStore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { callDef, testTurn } from "@/foundation/core/testing/toolCalls";
import { openFileToolGroup } from "@/features/files/core/index";
import { openDiffToolGroup } from "./tools";

/** 組のツールを chatId のチャットから呼ぶ */
const callIn = (group: AiToolGroup, chatId: number, args: Record<string, unknown>) => callDef(group.open(testTurn({ chatId }))![0], args);

test("open_file・open_diff: 作業場所の中のファイルを、頼んだチャットの系譜と一緒に頼む（外・ないファイルは断る。差分は消したファイルでもよい）", async () => {
  const store = testStore();
  const ctx = { store, project: store.projects.create({ name: "p", repo_path: tempDir(), provider: "claude" }) };
  const base = { project_id: ctx.project.id, provider: "claude" as const, status: "completed" as const };
  const root = ctx.store.chats.create({ ...base, title: "根" });
  const child = ctx.store.chats.create({ ...base, title: "子", parent_chat_id: root.id });
  fs.mkdirSync(path.join(ctx.project.repo_path, "src"));
  fs.writeFileSync(path.join(ctx.project.repo_path, "src", "a.ts"), "x");
  const published: BusEvent[] = [];
  const deps = { store: ctx.store, publish: (e: BusEvent) => published.push(e) };
  const openFile = (args: Record<string, unknown>) => callIn(openFileToolGroup(deps), child.id, args);
  const openDiff = (args: Record<string, unknown>) => callIn(openDiffToolGroup(deps), child.id, args);
  assert.match(await openFile({ path: "src/a.ts", line: 12, place: "window" }), /「src\/a.ts」の 12 行目を別ウィンドウで/);
  const e = published[0];
  assert.ok(e.type === "open_view" && e.request.kind === "file");
  assert.deepEqual([e.request.path, e.request.line, e.request.worktree, e.request.lineage.map((c) => c.id)], ["src/a.ts", 12, null, [root.id, child.id]]);
  // 絶対パスも作業場所の中なら相対に
  await openFile({ path: path.join(ctx.project.repo_path, "src", "a.ts") });
  assert.ok(published[1].type === "open_view" && published[1].request.kind === "file" && published[1].request.path === "src/a.ts" && published[1].request.place === null);
  await assert.rejects(openFile({ path: "ない.ts" }), /見つかりません/);
  await assert.rejects(openFile({ path: "/etc/hosts" }), /作業場所.*の外です/);
  assert.match(await openDiff({ path: "消した.ts" }), /消した.ts の位置/);
  assert.match(await openDiff({}), /コミットしていない変更を右の欄で/);
  assert.ok(published[3].type === "open_view" && published[3].request.kind === "diff" && published[3].request.path === null);
  await assert.rejects(openDiff({ path: "../外.ts" }), /外です/);
  assert.equal(published.length, 4);
});
