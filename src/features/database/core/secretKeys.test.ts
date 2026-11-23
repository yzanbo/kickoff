import { test } from "vitest";
import assert from "node:assert/strict";
import { dbSecretKey, dbSecretKeySql } from "./secretKeys";

test("秘密の値の名前と、SQL の中で組む式は同じ形", () => {
  assert.equal(dbSecretKey(7, "ai_password"), "db_connection:7:ai_password");
  assert.equal(dbSecretKeySql("OLD.id", "%"), "'db_connection:' || OLD.id || ':%'");
});
