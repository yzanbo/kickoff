import assert from "node:assert/strict";
import { test } from "vitest";
import { footnoteAt, footnotes } from "./footnotes";
import { noteMarkdownParser } from "./noteMarkdown";

const notesOf = (text: string) => footnotes(noteMarkdownParser.parse(text), text);

test("footnotes: 番号は本文で初めて出てきた順（同じ注は同じ番号）。定義のない印・指していない定義は番号なし", () => {
  const text = "A[^z]B[^y]C[^z]D[^ない]\n\n[^y]: 注 Y\n[^z]: 注 Z\n    続き\n[^w]: 指していない";
  const n = notesOf(text);
  assert.deepEqual(n.refs.map((r) => `${text.slice(r.from, r.to)}=${r.number}`), ["[^z]=1", "[^y]=2", "[^z]=1"]);
  assert.equal(n.defs.get("Z")?.text, "注 Z 続き");
  assert.equal(n.defs.get("W")?.number, null);
  const def = n.defs.get("Y")!;
  assert.equal(text.slice(def.from, def.markTo), "[^y]: ");
});

test("footnoteAt: 印の上なら印と定義", () => {
  const text = "本文[^1]\n\n[^1]: 注";
  const hit = footnoteAt(notesOf(text), text.indexOf("[^1]") + 1);
  assert.equal(hit?.def.text, "注");
  assert.equal(footnoteAt(notesOf(text), 0), null);
});

test("footnotes: 本文の途中の「注[^1]: …」の [^1] は印として読む（外すのは行の頭の定義だけ）", () => {
  const text = "注[^1]: 続きの文\n\n[^1]: 注の文";
  const n = notesOf(text);
  assert.deepEqual(n.refs.map((r) => [r.from, r.number]), [[1, 1]]);
  assert.equal(n.defs.get("1")?.text, "注の文");
});
