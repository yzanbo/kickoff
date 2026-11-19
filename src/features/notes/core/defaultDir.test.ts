import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultNotesDir } from "./defaultDir";

test("defaultNotesDir: アプリ名を空白のない小文字にしたフォルダ（開発版は kickoff-dev）", () => {
  assert.equal(defaultNotesDir("/data/Kickoff", "/Users/me/Documents"), "/Users/me/Documents/kickoff");
  assert.equal(defaultNotesDir("/data/Kickoff Dev", "/Users/me/Documents"), "/Users/me/Documents/kickoff-dev");
});
