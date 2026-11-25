import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { bashSandboxFor, COMMAND_TEMP_FOLDER, electronLaunchScripts, ELECTRON_DIRECT_COMMANDS, HOME_CACHE_DIRS, HOME_STATE_DIRS, sandboxPromptLines, scriptRunCommands } from "./bashSandbox";

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

test("書ける場所: 作業場所・ノートのフォルダ・共有の .git・サブエージェントのワークツリー・ゴミ箱・キャッシュ・OS の決まり。読むだけのフォルダは別に返す", async () => {
  const repo = gitRepo({ dir: path.join(tempDir({ real: true }), "repo"), files: { "a.txt": "a" } });
  const wt = path.join(path.dirname(repo.dir), "repo-worktrees", "feat-x");
  repo.git("worktree", "add", "-q", wt, "-b", "feat-x");
  const note = tempDir({ real: true });
  const trash = tempDir({ real: true });
  const ref = tempDir({ real: true });
  const sandbox = await bashSandboxFor(
    { rules: rules(["/opt/somewhere"], ["brew install:*"]), proxyPort: 4321, trashDir: trash },
    { workdir: wt, writableDirs: [note], readOnlyDirs: [ref] },
  );
  const home = os.homedir();
  for (const dir of [wt, note, path.join(repo.dir, ".git"), path.join(repo.dir, ".claude", "worktrees"), trash, "/opt/somewhere"]) {
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

test("書かせないフォルダ（共通のチャットから見た利用者のプロジェクト）は、一時フォルダの中でも書かせない側に入れる。書ける場所を中に持つものは入れない", async () => {
  const tmp = tempDir({ real: true });
  const alpha = path.join(tmp, "repos", "alpha");
  const parent = path.join(tmp, "kickoff");
  const work = path.join(parent, ".common-work");
  const common = path.join(parent, "_common");
  for (const dir of [alpha, work, common]) fs.mkdirSync(dir, { recursive: true });
  const sandbox = await bashSandboxFor(
    { rules: rules([tmp]), proxyPort: null, trashDir: null },
    { workdir: work, writableDirs: [common], readOnlyDirs: [], deniedDirs: [alpha, parent] },
  );
  assert.ok(sandbox.writableDirs.includes(tmp));
  assert.ok(sandbox.readOnlyDirs.includes(alpha));
  // 作業フォルダ・共通のノートを中に持つプロジェクトを書かせない側に入れると、そこまで書けなくなる（砂場の規則は後に書いたほうが勝つ）
  assert.ok(!sandbox.readOnlyDirs.includes(parent));
  // 渡さなければ、これまでどおり（プロジェクトのチャット）
  assert.deepEqual((await bashSandboxFor({ rules: rules([tmp]), proxyPort: null, trashDir: null }, { workdir: work, writableDirs: [common], readOnlyDirs: [] })).readOnlyDirs, []);
});

test("書かせないフォルダが一時フォルダの中にあるときだけ、作業場所の中にコマンドの一時ファイルの置き場を作って返す", async () => {
  const tmp = tempDir({ real: true });
  const elsewhere = tempDir({ real: true });
  const alpha = path.join(tmp, "repos", "alpha");
  const work = path.join(elsewhere, ".common-work");
  for (const dir of [alpha, work]) fs.mkdirSync(dir, { recursive: true });
  const deps = (tempDirs: string[]) => ({ rules: { ...rules([tmp]), tempDirs }, proxyPort: null, trashDir: null });
  const inTemp = await bashSandboxFor(deps([tmp]), { workdir: work, writableDirs: [], readOnlyDirs: [], deniedDirs: [alpha] });
  assert.equal(inTemp.commandTempDir, path.join(work, COMMAND_TEMP_FOLDER));
  assert.ok(fs.statSync(path.join(work, COMMAND_TEMP_FOLDER)).isDirectory());
  // 一時フォルダの外のプロジェクトだけなら作らない
  assert.equal((await bashSandboxFor(deps([path.join(tmp, "other")]), { workdir: work, writableDirs: [], readOnlyDirs: [], deniedDirs: [alpha] })).commandTempDir, null);
  // 書かせないフォルダを渡さない（プロジェクトのチャット）なら、一時フォルダの中の参照資料があっても作らない
  assert.equal((await bashSandboxFor(deps([tmp]), { workdir: work, writableDirs: [], readOnlyDirs: [alpha] })).commandTempDir, null);
});

test("Electron を使う作業場所だけ、Electron を起動するスクリプトを砂場の外で流す", async () => {
  const dir = tempDir({ real: true });
  const pkg = (deps: Record<string, string>) =>
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { dev: "electron-vite dev", build: "electron-vite build" }, devDependencies: deps }));
  const deps = { rules: rules(), proxyPort: null, trashDir: null };
  pkg({ vite: "1" });
  assert.deepEqual((await bashSandboxFor(deps, { workdir: dir, writableDirs: [], readOnlyDirs: [] })).unsandboxedCommands, []);
  pkg({ electron: "39" });
  const commands = (await bashSandboxFor(deps, { workdir: dir, writableDirs: [], readOnlyDirs: [] })).unsandboxedCommands;
  assert.ok(commands.includes("npm run dev:*"));
  assert.ok(!commands.some((c) => c.includes("build")));
  for (const c of ELECTRON_DIRECT_COMMANDS) assert.ok(commands.includes(c));
  // Git でないフォルダでも作れる（共有の .git はない）
  assert.ok(!(await bashSandboxFor(deps, { workdir: dir, writableDirs: [], readOnlyDirs: [] })).writableDirs.some((d) => d.endsWith(`${path.sep}.git`)));
});

test("システムプロンプトの砂場の行: 書けない場所・外のファイルは Edit で・設定を変えるコマンドは利用者に・直接の通信は通らないことと、外で流すコマンドは単独で流すことを伝える", () => {
  const prompt = sandboxPromptLines(["brew install:*", "npm run dev:*", "pnpm dev:*"], true).join("\n");
  assert.match(prompt, /砂場の中で動き/);
  assert.match(prompt, /Edit \/ Write を使って/);
  assert.match(prompt, /git config --global/);
  assert.match(prompt, /ssh などの直接の通信は通りません/);
  // 外で流すコマンドは npm・npx・brew の形だけを見せる
  assert.match(prompt, /`brew install`・`npm run dev`/);
  assert.doesNotMatch(prompt, /pnpm dev/);
  assert.match(prompt, /単独で流して/);
  const unrestricted = sandboxPromptLines([], false).join("\n");
  assert.match(unrestricted, /編集先を確認する Kickoff の制限はオフ/);
  assert.doesNotMatch(unrestricted, /Kickoff が利用者に確かめます/);
  // 外で流すコマンドがなければ、その行は書かない
  assert.doesNotMatch(sandboxPromptLines([], true).join("\n"), /砂場の外で流れます/);
});
