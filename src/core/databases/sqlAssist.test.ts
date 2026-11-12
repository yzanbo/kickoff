import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSqlAnswer, SQL_ASSIST_SCHEMA_CHARS, sqlAssistPrompt } from "./sqlAssist.js";

test("sqlAssistPrompt: テーブルと列の名前・いまの SQL・頼みを入れ、長すぎるテーブルは省いて数を書く", () => {
  const prompt = sqlAssistPrompt({ engine: "postgres", tables: [{ name: "users", columns: ["id", "email"] }], request: " 先週の登録数 ", current: "select 1" });
  assert.match(prompt, /^PostgreSQL の SQL を書いてください。/);
  assert.match(prompt, /<テーブルと列>\n- users\(id, email\)\n<\/テーブルと列>/);
  assert.match(prompt, /<いまの SQL>\nselect 1\n<\/いまの SQL>/);
  assert.match(prompt, /<頼み>\n先週の登録数\n<\/頼み>$/);
  // いまの SQL が空なら入れない
  assert.doesNotMatch(sqlAssistPrompt({ engine: "sqlite", tables: [], request: "x", current: " " }), /いまの SQL/);
  const big = Array.from({ length: 3 }, (_, i) => ({ name: `t${i}`, columns: ["c".repeat(SQL_ASSIST_SCHEMA_CHARS / 2)] }));
  const clipped = sqlAssistPrompt({ engine: "mysql", tables: big, request: "x", current: "" });
  assert.match(clipped, /- t0\(/);
  assert.doesNotMatch(clipped, /- t1\(/);
  assert.match(clipped, /ほかに 2 個のテーブルを省きました/);
});

test("parseSqlAnswer: コードの囲みの中を取り出し、なければ全体", () => {
  assert.equal(parseSqlAnswer("説明\n```sql\nselect 1;\n```\nおわり"), "select 1;");
  assert.equal(parseSqlAnswer("```\nselect 2\n```"), "select 2");
  assert.equal(parseSqlAnswer("  select 3  "), "select 3");
  assert.equal(parseSqlAnswer(" \n"), "");
});
