import assert from "node:assert/strict";
import { test } from "node:test";
import { testResultText } from "./connectionForm";

test("testResultText: つながった（版・SSL・時間）・SQLite は SSL を出さない・失敗は時間を後ろに", () => {
  assert.equal(testResultText({ ok: true, server_version: "PostgreSQL 16.4", error: null, duration_ms: 1234 }, "verify"), "つながりました（PostgreSQL 16.4 · SSL（証明書も確かめる） · 1,234 ms）");
  assert.equal(testResultText({ ok: true, server_version: null, error: null, duration_ms: 3 }, "off"), "つながりました（版は不明 · SSL なし · 3 ms）");
  assert.equal(testResultText({ ok: true, server_version: "SQLite 3.50", error: null, duration_ms: 1 }, null), "つながりました（SQLite 3.50 · 1 ms）");
  assert.equal(testResultText({ ok: false, server_version: null, error: "timeout", duration_ms: 10000 }, "require"), "つながりません: timeout（10,000 ms）");
  assert.equal(testResultText({ ok: false, server_version: null, error: "名前がありません", duration_ms: null }, null), "つながりません: 名前がありません");
});
