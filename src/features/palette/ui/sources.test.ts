import assert from "node:assert/strict";
import { test } from "vitest";
import type { PaletteItem } from "./paletteItem";
import { arrangePaletteItems, NAMED_LIMIT } from "./sources";

const item = (key: string, text: string, hint = ""): PaletteItem => ({ key, label: text, text, hint, icon: null });

test("arrangePaletteItems: 名前で見つかったものを 50 件まで先に、続けて中身の文の結果", () => {
  const named = Array.from({ length: 60 }, (_, i) => item(`n${i}`, `chat ${i}`));
  const text = [item("m1", "本文"), item("m2", "本文 2")];
  const all = arrangePaletteItems(named, text, "chat");
  assert.equal(all.length, NAMED_LIMIT + 2);
  assert.deepEqual(all.slice(-2).map((i) => i.key), ["m1", "m2"]);
  assert.equal(all[0].key, "n0");
});

test("arrangePaletteItems: 名前と右の薄い文で、大文字・小文字を区別せずに絞る。空の入力は絞らない", () => {
  const named = [item("a", "Alpha", "proj"), item("b", "beta", "Alpha の中"), item("c", "gamma", "other")];
  assert.deepEqual(arrangePaletteItems(named, [], " alpha ").map((i) => i.key), ["a", "b"]);
  assert.deepEqual(arrangePaletteItems(named, [], "").map((i) => i.key), ["a", "b", "c"]);
});
