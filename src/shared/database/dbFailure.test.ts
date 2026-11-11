import assert from "node:assert/strict";
import { test } from "node:test";
import { dbFailureKind, dbFixPrompt, dbMemoTemplate, suggestDbMemoName } from "./dbFailure";

test("dbFailureKind: ドライバの失敗の文から種類を見分ける", () => {
  const cases: [string, string][] = [
    ['password authentication failed for user "app"', "auth"],
    ["Access denied for user 'root'@'172.17.0.1' (using password: YES)", "auth"],
    ['no pg_hba.conf entry for host "1.2.3.4", user "app", database "shop", no encryption', "not_allowed"],
    ['database "shop" does not exist', "no_database"],
    ["Unknown database 'shop'", "no_database"],
    ["self-signed certificate in certificate chain", "ssl"],
    ["The server does not support SSL connections", "ssl"],
    ["getaddrinfo ENOTFOUND db.example.internal", "dns"],
    ["connect ECONNREFUSED 127.0.0.1:5432", "refused"],
    ["connect ETIMEDOUT 10.0.0.5:5432", "timeout"],
    ["Connection terminated due to connection timeout", "timeout"],
    ["unable to open database file", "file"],
    ["something else", "other"],
  ];
  for (const [message, kind] of cases) assert.equal(dbFailureKind(message), kind, message);
});

test("手順メモ: 名前の案はつなぎ方（環境とホスト）、ひな形は 4 つの見出しとパスワードを書かない注意", () => {
  assert.equal(suggestDbMemoName({ engine: "postgres", environment: "production", host: "db.example.com" }), "本番（db.example.com）");
  assert.equal(suggestDbMemoName({ engine: "sqlite", environment: "local", host: null }), "ローカル（SQLite）");
  const memo = dbMemoTemplate("本番（db）", "2026-11-11");
  for (const head of ["## つなぐ前にやること", "## つながらないときの直し方", "## 関係する場所", "## 変えた履歴", "パスワードそのものは書かない", "- 2026-11-11 作った"]) assert.ok(memo.includes(head), head);
});

test("dbFixPrompt: 失敗の文・種類・設定（パスワードなし）・手順メモの場所を入れる", () => {
  const base = { name: "本番", engine: "postgres", environment: "production", host: "db.example.com", port: 5432, database: "shop", username: "app", file_path: null, ssl: { mode: "require", ca_path: null }, read_only: true } as const;
  const text = dbFixPrompt({ ...base, memo_path: "DB/本番.md" }, "connect ETIMEDOUT 10.0.0.5:5432");
  assert.match(text, /ETIMEDOUT/);
  assert.match(text, /見分けた種類: 時間切れ・届かない/);
  assert.match(text, /- ホスト: db\.example\.com/);
  assert.match(text, /- SSL: 暗号化する/);
  assert.match(text, /「DB\/本番\.md」/);
  assert.doesNotMatch(text, /SQLite のファイル/);
  assert.match(dbFixPrompt({ ...base, memo_path: null }, "x"), /まだ手順メモがありません/);
});
