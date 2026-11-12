import assert from "node:assert/strict";
import { test } from "node:test";
import { dbAskPrompt } from "./dbAsk";

test("dbAskPrompt: 接続の名前・場所・テーブルと問いを入れ、kickoff_db のツールで確かめるよう頼む", () => {
  const c = { name: "ローカル", engine: "postgres" as const, environment: "local" as const };
  const one = dbAskPrompt(c, "app.public", ["users"], " 退会した人の数は？ ");
  assert.match(one, /^DB の接続「ローカル」（PostgreSQL · ローカル）の app\.public にあるテーブル「users」について聞きます。/);
  assert.match(one, /connection は「ローカル」/);
  assert.match(one, /\n\n退会した人の数は？$/);
  assert.match(dbAskPrompt(c, "main", ["a", "b"], "x"), /テーブル 「a」・「b」について/);
});
