// 守りをツールの形によらず当てる（承認の頼みで聞いてくる CLI 向け。メモの仕様書「0021」の Q3）
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tempDir } from "../../testing/tempDir.js";
import { deniedWithWords, judgeCommand, judgeWritePath } from "./judgeTool.js";
import { DOCKER_GUARD_DENIED } from "./dockerGuard.js";
import { WRITE_SCOPE_DENIED } from "./writeScope.js";

test("コマンド: 消すコマンドは断り、ほかの作業場所の Docker は聞き、何もなければ通す", async () => {
  const params = { cwd: "/w", deleteGuard: true, dockerGuard: { check: async (c: string) => (c.includes("down") ? { title: "止めます", description: "本体の db" } : null) } };
  assert.equal((await judgeCommand({ params }, "rm -rf dist")).kind, "deny");
  assert.deepEqual(await judgeCommand({ params }, "docker compose down"), { kind: "ask", title: "止めます", description: "本体の db", deniedReason: DOCKER_GUARD_DENIED });
  assert.deepEqual(await judgeCommand({ params }, "npm test"), { kind: "pass" });
  // Docker の判定が失敗したら通す
  assert.deepEqual(await judgeCommand({ params: { cwd: "/w", dockerGuard: { check: async () => Promise.reject(new Error("x")) } } }, "docker ps"), { kind: "pass" });
});

test("書く先: 参照資料は断り、作業場所の外は「このチャットでは許可」で覚えられる形で聞き、覚えたものは通す", async () => {
  const root = tempDir({ real: true });
  const work = path.join(root, "w");
  const ref = path.join(root, "ref");
  const allowed = new Set<string>();
  const ctx = { params: { cwd: work, readOnlyPaths: [ref], writeScope: { writableDirs: [], workplaces: async () => [], allowed } } };
  assert.equal((await judgeWritePath(ctx, path.join(ref, "a.md"))).kind, "deny");
  assert.deepEqual(await judgeWritePath(ctx, path.join(work, "a.ts")), { kind: "pass" });
  const outside = await judgeWritePath(ctx, path.join(root, "other.txt"));
  assert.equal(outside.kind, "ask");
  assert.ok(outside.kind === "ask" && outside.deniedReason === WRITE_SCOPE_DENIED && outside.rememberTarget);
  if (outside.kind === "ask" && outside.rememberTarget) allowed.add(outside.rememberTarget);
  assert.deepEqual(await judgeWritePath(ctx, path.join(root, "other.txt")), { kind: "pass" });
  assert.equal(deniedWithWords("断りました", "今は"), "断りました（利用者の言葉: 今は）");
});
