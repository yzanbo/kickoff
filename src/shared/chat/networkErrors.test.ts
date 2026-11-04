import assert from "node:assert/strict";
import { test } from "node:test";
import { isNetworkError } from "./networkErrors";

test("isNetworkError: 通信の切断・名前の引けない・時間切れを見分け、ほかの失敗は通信のせいにしない", () => {
  for (const message of [
    "API Error: Connection error.",
    "request to https://api.anthropic.com failed, reason: getaddrinfo ENOTFOUND api.anthropic.com",
    "TypeError: fetch failed",
    "read ECONNRESET",
    "connect ETIMEDOUT 160.79.104.10:443",
    "socket hang up",
  ]) {
    assert.equal(isNetworkError(message), true, message);
  }
  for (const message of ["Invalid API key", "rate_limit", "エージェントが結果を返さずに終了しました", "", null, undefined]) {
    assert.equal(isNetworkError(message), false, String(message));
  }
});
