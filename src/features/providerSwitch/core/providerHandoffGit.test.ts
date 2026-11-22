import assert from "node:assert/strict";
import { test } from "vitest";
import { providerHandoffGit } from "./providerHandoffGit";

test("AI にブランチとステージ状態・変更の種類・名前の変更を伝える", async () => {
  const result = await providerHandoffGit("/work", async () => ({ branch: "main", upstream: null, ahead: 0, behind: 0, staged: [{ path: "a", kind: "A" }], unstaged: [{ path: "new", old_path: "old", kind: "R" }], conflicts: [] }));
  assert.match(result.context, /ブランチ: main/);
  assert.match(result.context, /ステージ済み A "a"/);
  assert.match(result.context, /未ステージ R "new"（元: "old"）/);
  assert.equal(result.warning, null);
});

test("Git がない・失敗した場合は理由を知らせ、巨大な一覧は省略を明示する", async () => {
  const notRepo = await providerHandoffGit("/work", async () => null);
  assert.match(notRepo.warning ?? "", /取得できません/);
  const failure = await providerHandoffGit("/work", async () => { throw new Error("private error"); });
  assert.match(failure.context, /取得できません/);
  assert.doesNotMatch(failure.context, /private error/);
  const many = await providerHandoffGit("/work", async () => ({ branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: Array.from({ length: 501 }, (_, i) => ({ path: `f${i}`, kind: "U" as const })), conflicts: [] }));
  assert.match(many.context, /残り 1 件は省略/);
  assert.match(many.warning ?? "", /500 件/);
});
