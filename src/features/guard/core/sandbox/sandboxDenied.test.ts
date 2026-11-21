import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { bashOutputText, deniedWritePaths, sandboxDeniedNote } from "./sandboxDenied";
import type { BashSandbox } from "./bashSandbox";

test("出力から断られた場所を読む（zsh・bash のリダイレクト・コマンド・Python・Node の形。重なりは 1 つ）", () => {
  const out = [
    "(eval):1: operation not permitted: /Users/a/main.txt",
    "touch: /Users/a/x.txt: Operation not permitted",
    "bash: /Users/a/y.txt: Operation not permitted",
    "PermissionError: [Errno 1] Operation not permitted: '/Users/a/py.txt'",
    "Error: EPERM: operation not permitted, open '/Users/a/node.txt'",
    "touch: /Users/a/x.txt: Operation not permitted",
  ].join("\n");
  assert.deepEqual(deniedWritePaths(out).sort(), ["/Users/a/main.txt", "/Users/a/node.txt", "/Users/a/py.txt", "/Users/a/x.txt", "/Users/a/y.txt"]);
  assert.deepEqual(deniedWritePaths("ok\nexit=0"), []);
});

test("Bash の結果の文: stdout と stderr をつなぐ（文ならそのまま）", () => {
  assert.equal(bashOutputText({ stdout: "a", stderr: "b", interrupted: false }), "a\nb");
  assert.equal(bashOutputText("失敗"), "失敗");
  assert.equal(bashOutputText(null), "");
});

test("説明: ほかの作業場所は守りの断る文、外は Edit を案内、書ける場所の中なら砂場が守るファイル。読めなければ null", async () => {
  const work = tempDir({ real: true });
  const other = tempDir({ real: true });
  const sandbox: BashSandbox = { writableDirs: [work], readOnlyDirs: [], unsandboxedCommands: [], proxyPort: null };
  const judge = async (target: string) =>
    target.startsWith(other) ? { kind: "deny" as const, reason: "同じリポジトリの別の作業場所です（提案してください）" } : { kind: "ask" as const, title: "", description: "", deniedReason: "" };
  const out = [`(eval):1: operation not permitted: ${path.join(other, "a.txt")}`, `touch: /Users/nobody/.zshrc: Operation not permitted`, `touch: ${path.join(work, ".claude", "settings.json")}: Operation not permitted`].join("\n");
  const note = await sandboxDeniedNote(out, sandbox, judge);
  assert.ok(note);
  assert.match(note, /Kickoff の砂場が/);
  assert.match(note, /試し直しても通りません/);
  assert.match(note, /a\.txt: 同じリポジトリの別の作業場所です/);
  assert.match(note, /\.zshrc: 書ける場所の外です。.*Edit \/ Write/);
  assert.match(note, /settings\.json: 砂場がいつも書かせないファイル/);
  // 判定がなければ外として案内する
  assert.match((await sandboxDeniedNote(out, sandbox, null)) ?? "", /a\.txt: 書ける場所の外です/);
  assert.equal(await sandboxDeniedNote("exit=0", sandbox, judge), null);
});
