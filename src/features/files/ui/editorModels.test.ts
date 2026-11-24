import assert from "node:assert/strict";
import { test } from "vitest";
import { editorModelUris } from "./editorModels";

test("editorModelUris: 同じファイルを 2 か所で開いても、書く中身・差分の元の住所が重ならない（パスと拡張子は残す）", () => {
  const a = editorModelUris("src/a.ts");
  const b = editorModelUris("src/a.ts");
  const all = [a.modified, a.original, b.modified, b.original].map((u) => `${u.scheme}://${u.authority}${u.path}`);
  assert.equal(new Set(all).size, 4);
  for (const u of [a.modified, b.original]) assert.equal(u.path, "/src/a.ts");
});
