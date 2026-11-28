import assert from "node:assert/strict";
import { test } from "vitest";
import { imageSources, sameSources } from "./noteLinks";
import { noteMarkdownParser } from "./noteMarkdown";

const sourcesOf = (text: string) => imageSources(noteMarkdownParser.parse(text), text);

test("imageSources: ノートの中の画像の行き先を書いた順に（表・引用・リストの中も。行き先のない ![[名前]] と HTML の img は数えない）", () => {
  const text = "![a](https://x.y/1.png) と ![[名前]]\n\n| 画像 |\n|---|\n| ![b](https://x.y/2.png) |\n\n> - ![c](img/3.png)\n\n<img src=\"https://x.y/4.png\">";
  assert.deepEqual(sourcesOf(text), ["https://x.y/1.png", "https://x.y/2.png", "img/3.png"]);
});

test("sameSources: 中身が同じなら同じ", () => {
  assert.equal(sameSources(["a", "b"], ["a", "b"]), true);
  assert.equal(sameSources(["a"], ["a", "b"]), false);
  assert.equal(sameSources(["a", "b"], ["b", "a"]), false);
});
