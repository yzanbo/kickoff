import assert from "node:assert/strict";
import { test } from "vitest";
import { evaluateGitHookBypass } from "./gitHookGuard";

const judge = (command: string) => evaluateGitHookBypass("Bash", { command });
const denied = (command: string) => judge(command).decision === "deny";

test("フックを飛ばす git の書き方は断る（--no-verify・commit -n・core.hooksPath を変える）", () => {
  for (const command of [
    'git commit --no-verify -m "x"',
    'git commit -n -m "x"',
    'git commit -anm "x"',
    'git commit -a -n -m "x"',
    'git commit --no-veri -m "x"',
    "git push --no-verify",
    "git push origin main --no-verify",
    "git merge --no-verify feature",
    "git am --no-verify a.patch",
    'git -c core.hooksPath=/dev/null commit -m "x"',
    'git -c core.hookspath= commit -m "x"',
    "git --config-env=core.hooksPath=X push",
    "git -C repo commit --no-verify",
    "git config core.hooksPath /dev/null",
    "git config --local core.hooksPath .git/hooks",
    "git config --unset core.hooksPath",
    "git config unset core.hooksPath",
    "git config set core.hooksPath x",
    'npm test && git commit --no-verify -m "x"',
    "bash -c 'git commit -n -m x'",
    'FOO=1 git commit --no-verify -m "x"',
  ]) {
    assert.ok(denied(command), command);
  }
  const result = judge("git commit --no-verify");
  assert.equal(result.decision, "deny");
  if (result.decision === "deny") assert.match(result.reason, /原因を直して/);
});

test("ふつうのコミット・push と、値の中の -n・--no-verify、読むだけの git config は通す", () => {
  for (const command of [
    'git commit -m "fix"',
    'git commit -am "fix"',
    'git commit -m "-n を外す"',
    'git commit -m "--no-verify を断る"',
    "git commit -m -n",
    'git commit --author "a <a@b>" -m x',
    "git commit -- -n",
    "git push -n",
    "git push --dry-run",
    "git merge --no-ff feature",
    "git rebase main",
    "git config --get core.hooksPath",
    "git config core.hooksPath",
    "git config user.name x",
    "git -c user.name=x commit -m y",
    "git log -n 3",
    "echo --no-verify",
  ]) {
    assert.ok(!denied(command), command);
  }
  assert.equal(evaluateGitHookBypass("Read", { file_path: "/a" }).decision, "pass");
});
