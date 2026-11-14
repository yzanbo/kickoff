import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { loadOrCreateToken } from "./auth.js";
import { BrowserLogin } from "./browserLogin.js";
import { tempDir } from "../testing/tempDir.js";

test("loadOrCreateToken: 作り直しの印がなければ、前の版のトークン（/pair で配ったもの）を一度だけ作り直す。そのあとは同じトークン", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "token"), "o".repeat(32));
  const first = loadOrCreateToken(dir);
  assert.notEqual(first, "o".repeat(32));
  assert.equal(loadOrCreateToken(dir), first);
  assert.equal(fs.readFileSync(path.join(dir, "token"), "utf8"), first);
});

test("BrowserLogin: ログインの番号は一度だけ・期限まで使える", () => {
  let now = 0;
  const login = new BrowserLogin(() => now);
  const code = login.issue();
  assert.equal(login.consume("wrong"), false);
  assert.equal(login.consume(code), true);
  assert.equal(login.consume(code), false);
  const late = login.issue();
  now += 5 * 60_000 + 1;
  assert.equal(login.consume(late), false);
});
