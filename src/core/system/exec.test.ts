// 外部コマンドの補助: 実行と失敗の文・聞かれても待たない環境・実行ファイルの探し方
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CommandError, findExecutable, nonInteractiveEnv, runCommand, searchDirs, stderrOf } from "./exec.js";

test("runCommand: 標準出力を返し、失敗は標準エラーを文にした CommandError（終了コード付き）。okCodes の終了コードは失敗にしない", async () => {
  assert.equal(await runCommand("sh", ["-c", "printf 'hello'"]), "hello");
  const failed = await runCommand("sh", ["-c", "echo 'fatal: だめでした' >&2; exit 3"]).catch((e: unknown) => e);
  assert.ok(failed instanceof CommandError);
  assert.equal(failed.message, "fatal: だめでした");
  assert.equal(failed.code, 3);
  assert.equal(failed.stderr, "fatal: だめでした");
  assert.equal(await runCommand("sh", ["-c", "printf 'diff'; exit 1"], { okCodes: [1] }), "diff");
});

test("runCommand: 標準エラーがなければ元の例外の文。コマンドが見つからなければ code は ENOENT", async () => {
  const silent = await runCommand("sh", ["-c", "exit 2"]).catch((e: unknown) => e);
  assert.ok(silent instanceof CommandError);
  assert.match(silent.message, /Command failed/);
  const missing = await runCommand("kickoff-no-such-command", []).catch((e: unknown) => e);
  assert.ok(missing instanceof CommandError);
  assert.equal(missing.code, "ENOENT");
});

test("stderrOf: 例外の標準エラーの前後の空白を除く（なければ空）", () => {
  assert.equal(stderrOf(Object.assign(new Error("x"), { stderr: "  line1\nline2\n" })), "line1\nline2");
  assert.equal(stderrOf(new Error("x")), "");
  assert.equal(stderrOf(null), "");
});

test("nonInteractiveEnv: git と gh が認証などを聞いて待たないようにする（ほかの環境変数はそのまま）", () => {
  const env = nonInteractiveEnv();
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GH_PROMPT_DISABLED, "1");
  assert.equal(env.PATH, process.env.PATH);
});

test("実行ファイルの探し方: PATH の順、なければ Homebrew・~/.local/bin。名前は前のものを先に", () => {
  assert.deepEqual(searchDirs("/usr/bin:/opt/homebrew/bin"), ["/usr/bin", "/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local", "bin")]);
  const files = new Set(["/opt/homebrew/bin/whisper-cpp", "/usr/local/bin/whisper-cli"]);
  assert.equal(findExecutable(["whisper-cli", "whisper-cpp"], ["/opt/homebrew/bin", "/usr/local/bin"], (f) => files.has(f)), "/usr/local/bin/whisper-cli");
  assert.equal(findExecutable(["ffmpeg"], ["/opt/homebrew/bin"], (f) => files.has(f)), null);
  // 既定は PATH と補いの場所から、実行できるファイルだけ
  assert.match(findExecutable(["sh"]) ?? "", /\/sh$/);
  assert.equal(findExecutable(["kickoff-no-such-command"]), null);
});
