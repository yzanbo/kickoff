import { test } from "vitest";
import assert from "node:assert/strict";
import { imageSourcesIn } from "./images";

test("imageSourcesIn: Markdown の画像の src を書いた順に拾う（題名・<> 囲みも読む）", () => {
  const md = '前 ![a](https://x.example/a.png) 中 ![b](<docs/b.png> "題") ![c](https://x.example/c.png \'t\')\n[リンク](https://x.example/) 後';
  assert.deepEqual(imageSourcesIn(md), ["https://x.example/a.png", "docs/b.png", "https://x.example/c.png"]);
  assert.deepEqual(imageSourcesIn("画像なし"), []);
});
