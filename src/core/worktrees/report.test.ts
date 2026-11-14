import assert from "node:assert/strict";
import { test } from "node:test";
import { finishedText, lossText, movedToMainNotice, plannedText, type FinishOutcome } from "./report.js";

const base: FinishOutcome = { branch: "feat-x", changes: 0, merged: null, unmerged: 0, trashId: null, docker: "none", remote: null, chats: 0 };

test("lossText: 取り込んでいないコミットとコミットしていない変更（GitHub でマージ済みならコミットは数えない）", () => {
  assert.equal(lossText({ ...base, unmerged: 2, changes: 3 }), "取り込んでいないコミット 2 個・変更 3 ファイル");
  assert.equal(lossText({ ...base, unmerged: 2, merged: { via: "github", pr: 12 } }), null);
  assert.equal(lossText(base), null);
});

test("finishedText: 取り込み済みで失うものがなければ、どこで取り込んだかを書く", () => {
  assert.equal(finishedText({ ...base, merged: { via: "github", pr: 12 } }), "取り込み済み（GitHub の PR #12）のワークツリー（ブランチ feat-x）を片付けました。");
  assert.equal(finishedText({ ...base, merged: { via: "local", into: "main" } }), "取り込み済み（ローカル（main））のワークツリー（ブランチ feat-x）を片付けました。");
});

test("finishedText: 失うものがあれば、控えに入れたこととゴミ箱から戻せることをはっきり書く。Docker・リモート・チャットも", () => {
  const text = finishedText({ ...base, unmerged: 2, changes: 3, trashId: "t", docker: "removed", remote: { name: "origin/feat-x", error: null }, chats: 1 });
  assert.match(text, /取り込んでいないコミット 2 個・変更 3 ファイルを控えに入れて消しました。3 日間はゴミ箱から戻せます。/);
  assert.match(text, /Docker のコンテナとデータ（ボリューム）も消しました（戻せません）/);
  assert.match(text, /リモートのブランチ（origin\/feat-x）も消しました/);
  assert.match(text, /チャット 1 件は、次から本体で動きます/);
  assert.match(finishedText({ ...base, docker: "kept_shared" }), /共有しているので、Docker のデータは消さずに残しました/);
  assert.match(finishedText({ ...base, remote: { name: "origin/feat-x", error: "権限がありません" } }), /消せませんでした（権限がありません）/);
});

test("plannedText・movedToMainNotice: 予約したときの確かめの文と、本体に戻したチャットのお知らせ", () => {
  assert.equal(plannedText({ ...base, merged: { via: "github", pr: 3 } }), "ブランチ feat-x は取り込み済み（GitHub の PR #3）です。失うものはありません。");
  assert.match(plannedText({ ...base, changes: 1 }), /まだ本体に取り込まれていません。変更 1 ファイルは控えに入れてから消し/);
  assert.equal(movedToMainNotice("feat-x"), "ワークツリー（feat-x）を片付けました。次からは本体で動きます");
});
