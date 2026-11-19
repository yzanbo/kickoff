import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { gitRepo } from "../../testing/gitRepo.js";
import { tempDir } from "../../testing/tempDir.js";
import { bashSandboxFor, electronLaunchScripts, ELECTRON_DIRECT_COMMANDS, HOME_CACHE_DIRS, HOME_STATE_DIRS, scriptRunCommands } from "./bashSandbox.js";

const rules = (dirs: string[] = [], commands: string[] = []) => ({ tempDirs: [], writableDirs: async () => dirs, unsandboxedCommands: commands });

test("Electron を起動するスクリプトだけを見分ける（ビルド・パッケージ作りは入れない）", () => {
  const scripts = {
    dev: "electron-vite dev",
    "dev:cdp": "KICKOFF_REMOTE_DEBUG=9333 electron-vite dev",
    preview: "electron-vite preview",
    build: "electron-vite build",
    dist: "electron-vite build && electron-builder --mac",
    start: "electron .",
    forge: "electron-forge start",
    test: "node --test",
    weird: 42,
  };
  assert.deepEqual(electronLaunchScripts(scripts), ["dev", "dev:cdp", "preview", "start", "forge"]);
});

test("前に VAR=値 を並べて electron-vite dev を直接呼ぶスクリプトは Electron を起動するものに数え、Node の補助から起動するものは数えない", () => {
  const scripts = {
    "dev:fixture": "KICKOFF_REMOTE_DEBUG=9335 KICKOFF_PORT=4319 KICKOFF_USER_DATA_DIR=/private/tmp/kickoff-fixture electron-vite dev",
    // 中で electron-vite を起動しても、スクリプトの文字に出ていなければ見分けられない（砂場の中で流れる）
    "fixture:seed": "node scripts/devtools/fixture.mjs",
  };
  assert.deepEqual(electronLaunchScripts(scripts), ["dev:fixture"]);
  assert.ok(scriptRunCommands(electronLaunchScripts(scripts)).includes("npm run dev:fixture:*"));
});

test("スクリプトを流すコマンドは npm・pnpm・yarn・bun の形（start は npm start も）", () => {
  assert.deepEqual(scriptRunCommands(["dev"]), ["npm run dev:*", "pnpm dev:*", "pnpm run dev:*", "yarn dev:*", "yarn run dev:*", "bun run dev:*"]);
  assert.ok(scriptRunCommands(["start"]).includes("npm start:*"));
});

test("書ける場所: 作業場所・メモのフォルダ・共有の .git・サブエージェントのワークツリー・ゴミ箱・キャッシュ・OS の決まり。読むだけのフォルダは別に返す", async () => {
  const repo = gitRepo({ dir: path.join(tempDir({ real: true }), "repo"), files: { "a.txt": "a" } });
  const wt = path.join(path.dirname(repo.dir), "repo-worktrees", "feat-x");
  repo.git("worktree", "add", "-q", wt, "-b", "feat-x");
  const memo = tempDir({ real: true });
  const trash = tempDir({ real: true });
  const ref = tempDir({ real: true });
  const sandbox = await bashSandboxFor(
    { rules: rules(["/opt/somewhere"], ["brew install:*"]), proxyPort: 4321, trashDir: trash },
    { workdir: wt, memoDir: memo, readOnlyDirs: [ref] },
  );
  const home = os.homedir();
  for (const dir of [wt, memo, path.join(repo.dir, ".git"), path.join(repo.dir, ".claude", "worktrees"), trash, "/opt/somewhere"]) {
    assert.ok(sandbox.writableDirs.includes(dir), `${dir} が書ける場所にない: ${sandbox.writableDirs.join(", ")}`);
  }
  for (const d of [...HOME_CACHE_DIRS, ...HOME_STATE_DIRS]) assert.ok(sandbox.writableDirs.some((w) => w.endsWith(path.sep + d)), `${d} がない`);
  // docker の buildx は書けるが、認証の情報の入る ~/.docker 全体は書けない
  assert.ok(!sandbox.writableDirs.some((w) => w.endsWith(`${path.sep}.docker`)));
  // 本体の作業ファイル・ホームそのものは書けない
  assert.ok(!sandbox.writableDirs.includes(repo.dir));
  assert.ok(!sandbox.writableDirs.includes(fs.realpathSync(home)));
  assert.deepEqual(sandbox.readOnlyDirs, [ref]);
  assert.deepEqual(sandbox.unsandboxedCommands, ["brew install:*"]);
  assert.equal(sandbox.proxyPort, 4321);
});

test("Electron を使う作業場所だけ、Electron を起動するスクリプトを砂場の外で流す", async () => {
  const dir = tempDir({ real: true });
  const pkg = (deps: Record<string, string>) =>
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { dev: "electron-vite dev", build: "electron-vite build" }, devDependencies: deps }));
  const deps = { rules: rules(), proxyPort: null, trashDir: null };
  pkg({ vite: "1" });
  assert.deepEqual((await bashSandboxFor(deps, { workdir: dir, memoDir: null, readOnlyDirs: [] })).unsandboxedCommands, []);
  pkg({ electron: "39" });
  const commands = (await bashSandboxFor(deps, { workdir: dir, memoDir: null, readOnlyDirs: [] })).unsandboxedCommands;
  assert.ok(commands.includes("npm run dev:*"));
  assert.ok(!commands.some((c) => c.includes("build")));
  for (const c of ELECTRON_DIRECT_COMMANDS) assert.ok(commands.includes(c));
  // Git でないフォルダでも作れる（共有の .git はない）
  assert.ok(!(await bashSandboxFor(deps, { workdir: dir, memoDir: null, readOnlyDirs: [] })).writableDirs.some((d) => d.endsWith(`${path.sep}.git`)));
});
