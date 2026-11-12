// 連携先の GitHub のリポジトリの決め方（remote の URL の読み方・自動で選ぶ順・fork のときの head の持ち主。純粋な関数）
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubRemote } from "@shared/types";
import { autoGitHubRemote, parseGitHubRemotes, parseGitHubUrl, pickGitHubTarget } from "./githubTarget.js";
import { githubHostEnv, parseGhAccounts } from "./githubAccount.js";
import { repoArgs } from "./github.js";

const gh = (repo: string) => ({ host: "github.com", repo });

test("remote の URL: https・ssh・git@ の GitHub をホストと「持ち主/名前」にし、GitHub でなければ null", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/yzanbo/kickoff.git"), gh("yzanbo/kickoff"));
  assert.deepEqual(parseGitHubUrl("https://token@github.com/o/r"), gh("o/r"));
  assert.deepEqual(parseGitHubUrl("https://GitHub.com/o/r/"), gh("o/r"));
  assert.deepEqual(parseGitHubUrl("git@github.com:o/r.git"), gh("o/r"));
  assert.deepEqual(parseGitHubUrl("ssh://git@github.com/o/my.repo.git"), gh("o/my.repo"));
  assert.deepEqual(parseGitHubUrl("ssh://git@github.com:22/o/r.git"), gh("o/r"));
  assert.equal(parseGitHubUrl("https://gitlab.com/o/r.git"), null);
  assert.equal(parseGitHubUrl("https://github.com/o/r/tree/main"), null);
  assert.equal(parseGitHubUrl("/Users/me/repo"), null);
});

test("remote の URL: GitHub として扱うホストを渡せば、ほかのホスト（GitHub Enterprise）も読む。渡さなければ github.com だけ", () => {
  const hosts = ["github.com", "GHE.example.com"];
  assert.deepEqual(parseGitHubUrl("https://ghe.example.com/team/app.git", hosts), { host: "ghe.example.com", repo: "team/app" });
  assert.deepEqual(parseGitHubUrl("git@ghe.example.com:team/app.git", hosts), { host: "ghe.example.com", repo: "team/app" });
  assert.deepEqual(parseGitHubUrl("ssh://git@GHE.example.com:2222/team/app", hosts), { host: "ghe.example.com", repo: "team/app" });
  assert.equal(parseGitHubUrl("https://ghe.example.com/team/app.git"), null);
});

test("gh・git に渡す環境変数: github.com は GH_TOKEN だけ、Enterprise は GH_HOST と GH_ENTERPRISE_TOKEN（*.ghe.com は GH_TOKEN）", () => {
  assert.deepEqual(githubHostEnv("github.com", "t"), { GH_TOKEN: "t" });
  assert.deepEqual(githubHostEnv("github.com", null), {});
  assert.deepEqual(githubHostEnv("GHE.example.com", "t"), { GH_HOST: "ghe.example.com", GH_ENTERPRISE_TOKEN: "t" });
  assert.deepEqual(githubHostEnv("ghe.example.com", null), { GH_HOST: "ghe.example.com" });
  assert.deepEqual(githubHostEnv("corp.ghe.com", "t"), { GH_HOST: "corp.ghe.com", GH_TOKEN: "t" });
});

test("gh の --repo: github.com は「持ち主/名前」、Enterprise は「ホスト/持ち主/名前」。連携先がなければ渡さない", () => {
  assert.deepEqual(repoArgs({ host: "github.com", repo: "o/r", headOwner: "o" }), ["--repo", "o/r"]);
  assert.deepEqual(repoArgs({ host: "ghe.example.com", repo: "o/r", headOwner: "o" }), ["--repo", "ghe.example.com/o/r"]);
  assert.deepEqual(repoArgs(null), []);
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
    { name: "origin", host: "github.com", repo: "me/r", url: "https://github.com/me/r.git" },
    { name: "upstream", host: "github.com", repo: "org/r", url: "git@github.com:org/r.git" },
  ]);
});

test("git remote -v: 部分クローンの remote（行の終わりの「 [blob:none]」）も読む", () => {
  const out = "origin\thttps://github.com/cli/cli (fetch) [blob:none]\norigin\thttps://github.com/cli/cli (push)\n";
  assert.deepEqual(parseGitHubRemotes(out), [{ name: "origin", host: "github.com", repo: "cli/cli", url: "https://github.com/cli/cli" }]);
});

const remote = (name: string, repo: string, host = "github.com"): GitHubRemote => ({ name, host, repo, url: `https://${host}/${repo}.git` });

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
  assert.deepEqual(pickGitHubTarget(remotes, null, null), { host: "github.com", repo: "org/r", headOwner: "me" });
  assert.deepEqual(pickGitHubTarget(remotes, null, "origin"), { host: "github.com", repo: "me/r", headOwner: "me" });
  assert.deepEqual(pickGitHubTarget(remotes, null, "gone"), { host: "github.com", repo: "org/r", headOwner: "me" });
  // origin がなければ、連携先の持ち主
  assert.deepEqual(pickGitHubTarget([remote("upstream", "org/r")], null, null), { host: "github.com", repo: "org/r", headOwner: "org" });
  // ホストは連携先の remote のもの
  assert.deepEqual(pickGitHubTarget([remote("origin", "team/app", "ghe.example.com")], null, null), { host: "ghe.example.com", repo: "team/app", headOwner: "team" });
  assert.equal(pickGitHubTarget([], null, null), null);
});

test("gh のアカウント: gh auth status --json hosts のそのホストの分（既定は github.com。有効なもの・使えるか）。読めなければ空", () => {
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
  assert.deepEqual(parseGhAccounts(json, "GHE.example.com"), [{ login: "corp", active: true, ok: true }]);
  assert.deepEqual(parseGhAccounts(json, "other.example.com"), []);
  assert.deepEqual(parseGhAccounts("not json"), []);
});
