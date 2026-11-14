import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDeleteCommand } from "./deleteGuard.js";

const judge = (command: string) => evaluateDeleteCommand("Bash", { command });
const denied = (command: string) => judge(command).decision === "deny";

test("ファイルを消すコマンドは、どこのファイルでも断る（rm・unlink・shred・find -delete・find -exec rm・xargs rm）", () => {
  for (const command of [
    "rm src/old.ts",
    "rm -rf node_modules && npm install",
    "/bin/rm -f /tmp/x",
    "sudo rm -r build",
    "FOO=1 rm a",
    "unlink link",
    "shred -u secret.txt",
    "find . -name '*.log' -delete",
    "find dist -type f -exec rm {} \\;",
    "find . -execdir rm -f {} +",
    "ls *.tmp | xargs rm",
    "git ls-files -o | xargs -0 rm -f",
    "cd sub; rm x",
    "bash -c 'rm -rf out'",
    'sh -lc "cd a && rm b"',
    "if true; then rm a; fi",
  ]) {
    assert.ok(denied(command), command);
  }
  const reason = judge("rm a").decision === "deny" ? (judge("rm a") as { reason: string }).reason : "";
  assert.match(reason, /kickoff-trash/);
  assert.match(reason, /3 日/);
});

test("git clean は断る（下見の -n・--dry-run は通す）。断る文で git clean -n と kickoff-trash を案内する", () => {
  assert.ok(denied("git clean -fd"));
  assert.ok(denied("git -C repo clean -fdx"));
  assert.ok(!denied("git clean -n"));
  assert.ok(!denied("git clean -nd"));
  assert.ok(!denied("git clean --dry-run"));
  const result = judge("git clean -f");
  assert.ok(result.decision === "deny" && /git clean -n/.test(result.reason) && /kickoff-trash/.test(result.reason));
});

test("消さないものは通す（rmdir・git rm・kickoff-trash・文字の中の rm・ほかのツール）", () => {
  for (const command of [
    "rmdir empty",
    "git rm --cached a",
    "git rm old.ts",
    "kickoff-trash node_modules",
    "echo 'rm -rf /'",
    "grep -r 'rm ' src",
    "npm run rm-cache",
    "find . -name '*.ts'",
    "ls | xargs wc -l",
    "docker rm abc",
  ]) {
    assert.ok(!denied(command), command);
  }
  assert.equal(evaluateDeleteCommand("Write", { file_path: "/tmp/rm" }).decision, "pass");
});
