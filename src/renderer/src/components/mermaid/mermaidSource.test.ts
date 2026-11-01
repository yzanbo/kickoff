import assert from "node:assert/strict";
import { test } from "node:test";
import type { Element } from "hast";
import { mermaidSource } from "./mermaidSource";

const pre = (className: string[] | undefined, text: string): Element => ({
  type: "element",
  tagName: "pre",
  properties: {},
  children: [{ type: "element", tagName: "code", properties: className ? { className } : {}, children: [{ type: "text", value: text }] }],
});

test("```mermaid のコードブロックだけ、中身を取り出す（最後の改行は除く）", () => {
  assert.equal(mermaidSource(pre(["language-mermaid"], "graph TD\n  A-->B\n")), "graph TD\n  A-->B");
  assert.equal(mermaidSource(pre(["language-Mermaid"], "graph LR\n")), "graph LR");
  assert.equal(mermaidSource(pre(["language-ts"], "const a = 1\n")), undefined);
  assert.equal(mermaidSource(pre(undefined, "plain\n")), undefined);
  assert.equal(mermaidSource(undefined), undefined);
});
