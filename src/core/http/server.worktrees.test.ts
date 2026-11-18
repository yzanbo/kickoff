// ワークツリーの一覧: HEAD の見張り（ブランチを替えたら worktrees_changed で知らせる）と作業場所の色（覚えて変えない）
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import { PROJECT_HUES, workplaceDefaultHue } from "@shared/project/colors";
import type { BusEvent, GitWorktree } from "@shared/types";
import { setup, until } from "../testing/testServer.js";
import { gitIn, gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";
import { canWatchDirectory } from "../testing/canWatchDirectory.js";

type Ctx = ReturnType<typeof setup>;

const list = async (ctx: Ctx) => (await ctx.call("GET", `/api/projects/${ctx.project.id}/git/worktrees`)).body as GitWorktree[];
const hueOf = (worktrees: GitWorktree[], where: string) => worktrees.find((w) => w.path === where)?.hue;

test("作業場所の色: 本体はプロジェクトの色、ワークツリーは互いに被らない色を覚え、ブランチを替えても・ほかを足しても・作り直しても変わらない", async () => {
  const ctx = setup();
  const { dir: repo } = gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
  const git = gitIn(repo);
  const base = tempDir();
  const a = path.join(base, "a");
  git("worktree", "add", "-q", "-b", "feat/a", a);
  git("worktree", "add", "-q", "-b", "feat/b", path.join(base, "b"));
  const first = await list(ctx);
  const main = first.find((w) => w.main)!;
  assert.equal(main.hue, workplaceDefaultHue(ctx.project.id, ""));
  const hues = first.map((w) => w.hue);
  assert.ok(hues.every((h) => h !== undefined && (PROJECT_HUES as readonly number[]).includes(h)));
  assert.equal(new Set(hues).size, hues.length);
  const aHue = hueOf(first, a);
  // ブランチを替える・ほかのワークツリーを足す
  gitIn(a)("switch", "-q", "-c", "zzz");
  git("worktree", "add", "-q", "-b", "aaa", path.join(base, "0"));
  assert.equal(hueOf(await list(ctx), a), aHue);
  // 同じフォルダに作り直しても同じ色
  git("worktree", "remove", a);
  git("worktree", "add", "-q", "-b", "feat/again", a);
  assert.equal(hueOf(await list(ctx), a), aHue);
});

test("HEAD の見張り: 本体・ワークツリーのブランチ切り替えと、最初のワークツリーの追加・削除を知らせる", async (t) => {
  if (!(await canWatchDirectory())) t.skip("この環境では OS のディレクトリ監視を開始できません（EMFILE）。実際の監視は別の環境で確認してください");
  const ctx = setup();
  const { dir: repo } = gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
  const git = gitIn(repo);
  // git はワークツリーを実際のパス（/tmp → /private/tmp）で返すので、比べるパスも実際のパスにする
  const wt = path.join(tempDir({ real: true }), "w");
  const events: BusEvent[] = [];
  ctx.bus.subscribe((e) => events.push(e));
  const changed = () => events.filter((e) => e.type === "worktrees_changed" && e.project_id === ctx.project.id).length;
  await list(ctx);
  git("switch", "-q", "-c", "other");
  await until(() => changed() > 0);
  let before = changed();
  git("worktree", "add", "-q", "-b", "feat/w", wt);
  await until(() => changed() > before);
  assert.equal((await list(ctx)).find((w) => w.path === wt)?.branch, "feat/w");
  before = changed();
  gitIn(wt)("switch", "-q", "-c", "feat/w2");
  await until(() => changed() > before);
  assert.equal((await list(ctx)).find((w) => w.path === wt)?.branch, "feat/w2");
  before = changed();
  git("worktree", "remove", wt);
  await until(() => changed() > before);
  assert.equal((await list(ctx)).some((w) => w.path === wt), false);
});
