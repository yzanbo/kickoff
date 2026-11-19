import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { loadOrCreateToken } from "./auth";
import { BrowserLogin } from "./browserLogin";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("loadOrCreateToken: token がなければ作り、次からは同じ token を返す", () => {
  const dir = tempDir();
  const first = loadOrCreateToken(dir);
  assert.equal(loadOrCreateToken(dir), first);
  assert.equal(fs.readFileSync(path.join(dir, "token"), "utf8"), first);
});

test("BrowserLogin: ログインの番号は一度だけ・期限まで使える", () => {
  let now = 0;
  const login = new BrowserLogin({ now: () => now });
  const code = login.issue();
  assert.equal(login.consume("wrong"), false);
  assert.equal(login.consume(code), true);
  assert.equal(login.consume(code), false);
  const late = login.issue();
  now += 5 * 60_000 + 1;
  assert.equal(login.consume(late), false);
});
