import assert from "node:assert/strict";
import { test } from "node:test";
import { branchSuggestPrompt, parseBranchSuggestions, toBranchName } from "./branchSuggest.js";

test("ブランチ名の案の頼み: やりたいことといまあるブランチを入れ、1 行に 1 つ名前だけを頼む", () => {
  const prompt = branchSuggestPrompt("  ログイン画面を作る\n", ["main", "feature/login"]);
  assert.match(prompt, /いまあるブランチ（同じ名前は避ける）: main, feature\/login/);
  assert.match(prompt, /<やりたいこと>\nログイン画面を作る\n<\/やりたいこと>$/);
  assert.doesNotMatch(branchSuggestPrompt("x", []), /いまあるブランチ/);
});

test("ブランチ名にそろえる: 英小文字・数字・/ . _ - だけにし、空白はハイフン、使えない形は除く", () => {
  assert.equal(toBranchName("Feature/Add Login Page"), "feature/add-login-page");
  assert.equal(toBranchName("fix/..bad..name.lock"), "fix/bad.name");
  assert.equal(toBranchName("feature//-x-/"), "feature/x");
  assert.equal(toBranchName("ログイン"), null);
  assert.equal(toBranchName("ab"), null);
  assert.equal(toBranchName("hotfix"), "hotfix");
  assert.ok((toBranchName(`feature/${"a".repeat(100)}`) ?? "").length <= 60);
});

test("ブランチ名の案を読む: 番号・印・引用符を外し、いまあるもの・重なりを除いて 3 つまで", () => {
  const answer = "1. `feature/login-page`\n- feature/Login-Page\n* fix/session-timeout （説明）\n\nmain\nrefactor/auth\ndocs/readme";
  assert.deepEqual(parseBranchSuggestions(answer, ["main"]), ["feature/login-page", "fix/session-timeout", "refactor/auth"]);
  assert.deepEqual(parseBranchSuggestions("ログイン画面", []), []);
});
