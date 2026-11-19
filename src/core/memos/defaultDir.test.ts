import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultMemosDir } from "./defaultDir.js";

test("defaultMemosDir: アプリ名を空白のない小文字にしたフォルダ（開発版は kickoff-dev）", () => {
  assert.equal(defaultMemosDir("/data/Kickoff", "/Users/me/Documents"), "/Users/me/Documents/kickoff");
  assert.equal(defaultMemosDir("/data/Kickoff Dev", "/Users/me/Documents"), "/Users/me/Documents/kickoff-dev");
});
