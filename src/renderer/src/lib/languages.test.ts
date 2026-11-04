import assert from "node:assert/strict";
import { test } from "node:test";
import { languageOf } from "./languages";

test("languageOf: 拡張子（大文字・小文字を問わない）と Dockerfile から言語を決め、知らない種類・拡張子だけの名前は undefined", () => {
  assert.equal(languageOf("src/a.ts"), "typescript");
  assert.equal(languageOf("/x/App.TSX"), "tsx");
  assert.equal(languageOf("/tmp/net-watch.mjs"), "javascript");
  assert.equal(languageOf("scripts/run.sh"), "shellscript");
  assert.equal(languageOf("docker/Dockerfile"), "dockerfile");
  assert.equal(languageOf("README"), undefined);
  assert.equal(languageOf(".env"), undefined);
  assert.equal(languageOf("a.unknown"), undefined);
});
