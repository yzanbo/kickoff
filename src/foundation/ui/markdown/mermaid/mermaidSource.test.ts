import assert from "node:assert/strict";
import { test } from "vitest";
import type { Element } from "hast";
import { codeBlockOf } from "./mermaidSource";

const pre = (className: string[] | undefined, text: string): Element => ({
  type: "element",
  tagName: "pre",
  properties: {},
  children: [{ type: "element", tagName: "code", properties: className ? { className } : {}, children: [{ type: "text", value: text }] }],
});

test("コードブロックの言語と中身を取り出す（言語がなければ空、コードブロックでなければ undefined）", () => {
  assert.deepEqual(codeBlockOf(pre(["language-TS"], "const a = 1\n")), { language: "ts", text: "const a = 1" });
  assert.deepEqual(codeBlockOf(pre(undefined, "npm run dev\n")), { language: "", text: "npm run dev" });
  assert.equal(codeBlockOf(undefined), undefined);
});
