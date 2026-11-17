// ワークツリーの一覧: HEAD の見張り（ブランチを替えたら worktrees_changed で知らせる）
import path from "node:path";
import { test } from "vitest";
import type { BusEvent, GitWorktree } from "@shared/types";
import { setup, until } from "../testing/testServer.js";
import { gitIn, gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";

type Ctx = ReturnType<typeof setup>;

const list = async (ctx: Ctx) => (await ctx.call("GET", `/api/projects/${ctx.project.id}/git/worktrees`)).body as GitWorktree[];

test("HEAD の見張り: 一覧を読んだプロジェクトで、本体・ワークツリーのブランチを替えたら worktrees_changed を知らせる", async () => {
  const ctx = setup();
  const { dir: repo } = gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
  const git = gitIn(repo);
  const wt = path.join(tempDir(), "w");
  git("worktree", "add", "-q", "-b", "feat/w", wt);
  const events: BusEvent[] = [];
  ctx.bus.subscribe((e) => events.push(e));
  const changed = () => events.filter((e) => e.type === "worktrees_changed" && e.project_id === ctx.project.id).length;
  await list(ctx);
  git("switch", "-q", "-c", "other");
  await until(() => changed() > 0);
  const before = changed();
  gitIn(wt)("switch", "-q", "-c", "feat/w2");
  await until(() => changed() > before);
});
