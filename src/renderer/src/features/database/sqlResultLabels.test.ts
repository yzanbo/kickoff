import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbQueryResult } from "@shared/types";
import { envSentence, runOutcome, runTabLabel } from "./sqlResultLabels";

const result = (over: Partial<DbQueryResult>): DbQueryResult => ({ columns: [], rows: [], truncated: false, affected: null, duration_ms: 4.2, in_transaction: false, ...over });
const col = { name: "id", type: "int" };

test("runTabLabel / runOutcome: 行の数・変えた行・失敗・流していない", () => {
  assert.equal(runTabLabel({ sql: "s", write: false, result: result({ columns: [col], rows: [[1], [2]] }) }, 0), "結果 1 · 2 行");
  assert.equal(runTabLabel({ sql: "s", write: false, result: result({ columns: [col], rows: [[1]], truncated: true }) }, 1), "結果 2 · 1 行（続きあり）");
  assert.equal(runTabLabel({ sql: "u", write: false, result: result({ affected: 1204 }) }, 2), "結果 3 · 1,204 行を変えた");
  assert.equal(runTabLabel({ sql: "x", write: false, error: "syntax" }, 3), "結果 4 · 失敗");
  assert.equal(runTabLabel({ sql: "y", write: false, skipped: true }, 4), "結果 5 · 流していない");
  assert.equal(runOutcome({ sql: "s", write: false, result: result({ columns: [col], rows: [[1]] }) }), "1 行 · 4.2 ms");
  assert.equal(runOutcome({ sql: "c", write: false, result: result({}) }), "流した · 4.2 ms");
});

test("envSentence: 読み取り専用・確かめ方ごと", () => {
  assert.equal(envSentence({ environment: "production", read_only: true, write_check: "env_name" }), "本番（読み取り専用）");
  assert.equal(envSentence({ environment: "staging", read_only: false, write_check: "all" }), "ステージング（書き込みは確認してから流す）");
  assert.equal(envSentence({ environment: "production", read_only: false, write_check: "env_name" }), "本番（書き込みは環境の名前を打ってから流す）");
  assert.equal(envSentence({ environment: "dev", read_only: false, write_check: "dangerous" }), "開発（危険な文だけ確かめる）");
});
