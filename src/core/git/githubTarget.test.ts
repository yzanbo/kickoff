// 連携先の GitHub のリポジトリの決め方（remote の URL の読み方・自動で選ぶ順・fork のときの head の持ち主。純粋な関数）
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubRemote } from "@shared/types";
import { autoGitHubRemote, parseGitHubRemotes, parseGitHubRepo, pickGitHubTarget } from "./githubTarget.js";
import { parseGhAccounts } from "./githubAccount.js";

test("remote の URL: https・ssh・git@ の GitHub を「持ち主/名前」にし、GitHub でなければ null", () => {
  assert.equal(parseGitHubRepo("https://github.com/yzanbo/kickoff.git"), "yzanbo/kickoff");
  assert.equal(parseGitHubRepo("https://token@github.com/o/r"), "o/r");
  assert.equal(parseGitHubRepo("git@github.com:o/r.git"), "o/r");
  assert.equal(parseGitHubRepo("ssh://git@github.com/o/my.repo.git"), "o/my.repo");
  assert.equal(parseGitHubRepo("https://gitlab.com/o/r.git"), null);
  assert.equal(parseGitHubRepo("/Users/me/repo"), null);
});

test("git remote -v: 取ってくる側の GitHub の remote だけを、名前ごとに 1 つ", () => {
  const out = [
    "origin\thttps://github.com/me/r.git (fetch)",
    "origin\thttps://github.com/me/r.git (push)",
    "upstream\tgit@github.com:org/r.git (fetch)",
    "upstream\tgit@github.com:org/r.git (push)",
    "backup\t/Volumes/disk/r.git (fetch)",
  ].join("\n");
  assert.deepEqual(parseGitHubRemotes(out), [
    { name: "origin", repo: "me/r", url: "https://github.com/me/r.git" },
    { name: "upstream", repo: "org/r", url: "git@github.com:org/r.git" },
  ]);
});

test("git remote -v: 部分クローンの remote（行の終わりの「 [blob:none]」）も読む", () => {
  const out = "origin\thttps://github.com/cli/cli (fetch) [blob:none]\norigin\thttps://github.com/cli/cli (push)\n";
  assert.deepEqual(parseGitHubRemotes(out), [{ name: "origin", repo: "cli/cli", url: "https://github.com/cli/cli" }]);
});

const remote = (name: string, repo: string): GitHubRemote => ({ name, repo, url: `https://github.com/${repo}.git` });

test("自動で選ぶ連携先: gh repo set-default → upstream → origin → 最初のもの", () => {
  const remotes = [remote("origin", "me/r"), remote("upstream", "org/r"), remote("other", "x/r")];
  assert.equal(autoGitHubRemote(remotes, "other")?.name, "other");
  assert.equal(autoGitHubRemote(remotes, null)?.name, "upstream");
  assert.equal(autoGitHubRemote([remote("origin", "me/r"), remote("other", "x/r")], null)?.name, "origin");
  assert.equal(autoGitHubRemote([remote("other", "x/r")], null)?.name, "other");
  assert.equal(autoGitHubRemote([], null), null);
});

test("連携先: 選んだ remote（もうなければ自動）。head の持ち主は手元のブランチをプッシュする origin の持ち主", () => {
  const remotes = [remote("origin", "me/r"), remote("upstream", "org/r")];
  // fork: 元のリポジトリに、自分の fork のブランチから PR を出す
  assert.deepEqual(pickGitHubTarget(remotes, null, null), { repo: "org/r", headOwner: "me" });
  assert.deepEqual(pickGitHubTarget(remotes, null, "origin"), { repo: "me/r", headOwner: "me" });
  assert.deepEqual(pickGitHubTarget(remotes, null, "gone"), { repo: "org/r", headOwner: "me" });
  // origin がなければ、連携先の持ち主
  assert.deepEqual(pickGitHubTarget([remote("upstream", "org/r")], null, null), { repo: "org/r", headOwner: "org" });
  assert.equal(pickGitHubTarget([], null, null), null);
});

test("gh のアカウント: gh auth status --json hosts の github.com の分（有効なもの・使えるか）。読めなければ空", () => {
  const json = JSON.stringify({
    hosts: {
      "github.com": [
        { state: "success", active: true, login: "me" },
        { state: "error", active: false, login: "old" },
        { state: "success", active: false, login: "work" },
      ],
      "ghe.example.com": [{ state: "success", active: true, login: "corp" }],
    },
  });
  assert.deepEqual(parseGhAccounts(json), [
    { login: "me", active: true, ok: true },
    { login: "old", active: false, ok: false },
    { login: "work", active: false, ok: true },
  ]);
  assert.deepEqual(parseGhAccounts("not json"), []);
});
