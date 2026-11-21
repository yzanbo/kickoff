import assert from "node:assert/strict";
import os from "node:os";
import { test } from "vitest";
import { MACOS_SELF_GUARD } from "@/features/guard/core/macosRules";
import { currentSelf, evaluateSelfProtection, type SelfInfo } from "./selfProtection";

const home = os.homedir();
const prod: SelfInfo = {
  // コアのプロセス（4242）と Electron のメインプロセス（4100）
  pids: [4242, 4100],
  dataDir: `${home}/Library/Application Support/Kickoff`,
  port: 4317,
  appName: "Kickoff",
  guard: MACOS_SELF_GUARD,
  appBundle: "/Applications/Kickoff.app",
};
const bash = (command: string) => evaluateSelfProtection(prod, "Bash", { command }).kind;

test("evaluateSelfProtection: 自分のプロセスを止めるコマンドを断る", () => {
  assert.equal(bash("kill -TERM 4242"), "deny");
  assert.equal(bash("kill 4242 && echo done"), "deny");
  // メインプロセスも自分（止めると全部が止まる）。断る文には当たった pid を出す
  const main = evaluateSelfProtection(prod, "Bash", { command: "kill -9 4100" });
  assert.ok(main.kind === "deny" && main.reason.includes("プロセス 4100"));
  assert.equal(bash("kill -TERM 41000"), "pass");
  assert.equal(bash("pkill -f Kickoff"), "deny");
  assert.equal(bash("killall Kickoff"), "deny");
  assert.equal(bash(`osascript -e 'tell application "Kickoff" to quit'`), "deny");
  // 開発版（Kickoff Dev・別のプロセス）は止めてよい
  assert.equal(bash("kill -TERM 42420"), "pass");
  assert.equal(bash("kill -TERM 1234"), "pass");
  assert.equal(bash(`osascript -e 'tell application "Kickoff Dev" to quit'`), "pass");
});

test("evaluateSelfProtection: アプリ本体・保存先・自分の API に触るコマンドを断る", () => {
  assert.equal(bash("rm -rf /Applications/Kickoff.app"), "deny");
  assert.equal(bash(`rm -rf "${home}/Library/Application Support/Kickoff"`), "deny");
  assert.equal(bash("rm -rf ~/Library/Application\\ Support/Kickoff/"), "deny");
  assert.equal(bash('cat "$HOME/Library/Application Support/Kickoff/token"'), "deny");
  assert.equal(bash("curl -s http://127.0.0.1:4317/api/projects"), "deny");
  assert.equal(bash("curl localhost:4317/api/status"), "deny");
  // 開発版の保存先・ポートは触ってよい
  assert.equal(bash('rm -rf "$HOME/Library/Application Support/Kickoff Dev"'), "pass");
  assert.equal(bash("cat ~/Library/Application\\ Support/Kickoff\\ Dev/token"), "pass");
  assert.equal(bash("curl -s http://127.0.0.1:4318/api/status"), "pass");
  assert.equal(bash("curl -s http://127.0.0.1:43170/"), "pass");
  // ふつうの開発のコマンド
  assert.equal(bash("npm run dev"), "pass");
  assert.equal(bash("git commit -m 'fix: Kickoff の画面'"), "pass");
});

test("evaluateSelfProtection: ファイルのツールで保存先を読み書きするのを断る", () => {
  const tool = (name: string, input: Record<string, unknown>) => evaluateSelfProtection(prod, name, input).kind;
  assert.equal(tool("Read", { file_path: `${home}/Library/Application Support/Kickoff/token` }), "deny");
  assert.equal(tool("Write", { file_path: `${home}/Library/Application Support/Kickoff/kickoff.db` }), "deny");
  assert.equal(tool("Grep", { path: `${home}/Library/Application Support/Kickoff` }), "deny");
  assert.equal(tool("Read", { file_path: `${home}/Library/Application Support/Kickoff Dev/token` }), "pass");
  assert.equal(tool("Read", { file_path: "/Users/someone/repo/src/main.ts" }), "pass");
  // チャットの添付ファイルは、Read で読むだけなら通す（書き込み・検索・外へ出る道は断る）
  const upload = `${home}/Library/Application Support/Kickoff/uploads/4c9a0817/image.png`;
  assert.equal(tool("Read", { file_path: upload }), "pass");
  assert.equal(tool("Write", { file_path: upload }), "deny");
  assert.equal(tool("Grep", { path: `${home}/Library/Application Support/Kickoff/uploads` }), "deny");
  assert.equal(tool("Read", { file_path: `${home}/Library/Application Support/Kickoff/uploads/../kickoff.db` }), "deny");
  assert.equal(tool("Read", { file_path: `${home}/Library/Application Support/Kickoff/uploads-x/a.png` }), "deny");
});

test("evaluateSelfProtection: 開発中（アプリ本体なし）は、本体の判定をしない", () => {
  const dev: SelfInfo = { pids: [7], dataDir: `${home}/Library/Application Support/Kickoff Dev`, port: 4318, appName: "Kickoff Dev", guard: MACOS_SELF_GUARD };
  const run = (command: string) => evaluateSelfProtection(dev, "Bash", { command }).kind;
  assert.equal(run("ls /Applications/Kickoff.app"), "pass");
  assert.equal(run("curl localhost:4318/api/status"), "deny");
  assert.equal(run('rm -rf "$HOME/Library/Application Support/Kickoff Dev"'), "deny");
  assert.equal(run("killall 'Kickoff Dev'"), "deny");
  // 開発版が自分のときは、開発版を使うようには案内しない（食い違うため）。製品版のときは案内する
  const devReason = evaluateSelfProtection(dev, "Bash", { command: "curl localhost:4318/" });
  assert.ok(devReason.kind === "deny" && !devReason.reason.includes("開発版"));
  const prodReason = evaluateSelfProtection(prod, "Bash", { command: "curl localhost:4317/" });
  assert.ok(prodReason.kind === "deny" && prodReason.reason.includes("開発版"));
});

test("evaluateSelfProtection: Kickoff が置いた kickoff-trash（保存先の bin/）を場所で呼ぶのは通す（ほかの保存先の中は断る）", () => {
  assert.equal(bash(`"${prod.dataDir}/bin/kickoff-trash" dist`), "pass");
  assert.equal(bash(`~/Library/Application\\ Support/Kickoff/bin/kickoff-trash a.txt`), "pass");
  assert.equal(bash(`ls "${prod.dataDir}/trash"`), "deny");
});

test("currentSelf: メインプロセスの pid を渡せば、コアのプロセスと両方を自分にする（単体のコアは自分だけ）", () => {
  const platform = { appBundleOf: () => null };
  assert.deepEqual(currentSelf("/tmp/Kickoff Dev", 4318, platform, MACOS_SELF_GUARD, 1).pids, [process.pid, 1]);
  assert.deepEqual(currentSelf("/tmp/Kickoff Dev", 4318, platform, MACOS_SELF_GUARD).pids, [process.pid]);
});
