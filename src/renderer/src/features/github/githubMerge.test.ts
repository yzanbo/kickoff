import assert from "node:assert/strict";
import { test } from "node:test";
import { makePullDetail } from "@shared/testing/factories";
import { mainCheckoutNotes, mergeWarnings, pickMergeMethod } from "./githubMerge";

test("マージの注意: 何もなければ空、落ちた・途中のチェック・変更依頼・承認なし・古いブランチ・衝突・下書きを出す", () => {
  assert.deepEqual(mergeWarnings(makePullDetail()), []);
  const base = makePullDetail();
  const bad = makePullDetail({
    item: { ...base.item, is_draft: true, review_decision: "changes_requested" },
    mergeable: "conflicting",
    merge_state: "dirty",
    checks: [
      { name: "test", workflow: null, state: "failure", description: null, url: null },
      { name: "lint", workflow: null, state: "pending", description: null, url: null },
      { name: "build", workflow: null, state: "success", description: null, url: null },
    ],
  });
  const texts = mergeWarnings(bad).map((w) => `${w.level}:${w.text}`);
  assert.equal(texts.length, 5);
  assert.match(texts[0], /^danger:下書き/);
  assert.match(texts[1], /^danger:.*衝突/);
  assert.match(texts[2], /^danger:CI のチェックが 1 件落ちています（test）/);
  assert.match(texts[3], /^warn:.*1 件まだ終わっていません/);
  assert.match(texts[4], /^danger:.*変更を依頼/);

  const behind = mergeWarnings(makePullDetail({ merge_state: "behind", item: { ...base.item, review_decision: "review_required" } }));
  assert.deepEqual(
    behind.map((w) => w.level),
    ["warn", "warn"],
  );
  assert.match(behind[1].text, /古くなっています/);
  // 理由の分からない保護ルールの止まりは、ほかに理由がないときだけ
  assert.match(mergeWarnings(makePullDetail({ merge_state: "blocked" }))[0].text, /保護ルール/);
});

test("マージの方式: 前回のものを許していればそれ、なければ許すものの初め", () => {
  assert.equal(pickMergeMethod("squash", ["merge", "squash"]), "squash");
  assert.equal(pickMergeMethod("rebase", ["merge", "squash"]), "merge");
  assert.equal(pickMergeMethod(null, ["squash"]), "squash");
  assert.equal(pickMergeMethod("merge", []), null);
});

test("本体に取り出す前の注意: 変更のファイル数と、作業中のチャット（4 つ目からは「など」）", () => {
  assert.deepEqual(mainCheckoutNotes(0, []), []);
  const notes = mainCheckoutNotes(2, ["a", "b", "c", "d"]);
  assert.match(notes[0], /2 ファイル/);
  assert.match(notes[1], /（a、b、c など）/);
});
