// GitHub のホストの決まり（github.com か・Web のページの頭・URL のホスト。純粋な関数）
import assert from "node:assert/strict";
import { test } from "node:test";
import { githubHostOfUrl, githubWebOrigin, isDefaultGitHubHost } from "./host";

test("GitHub のホスト: github.com かは大文字・小文字を問わず、Web の頭は https://ホスト（小文字）", () => {
  assert.equal(isDefaultGitHubHost("GitHub.com"), true);
  assert.equal(isDefaultGitHubHost("ghe.example.com"), false);
  assert.equal(githubWebOrigin("github.com"), "https://github.com");
  assert.equal(githubWebOrigin("GHE.example.com"), "https://ghe.example.com");
});

test("URL のホスト: 読めなければ null", () => {
  assert.equal(githubHostOfUrl("https://github.com/o/r/pull/5"), "github.com");
  assert.equal(githubHostOfUrl("https://GHE.example.com/o/r/issues/1"), "ghe.example.com");
  assert.equal(githubHostOfUrl("not a url"), null);
});
