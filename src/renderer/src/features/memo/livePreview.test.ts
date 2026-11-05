import assert from "node:assert/strict";
import { test } from "node:test";
import { GFM, parser } from "@lezer/markdown";
import { previewMarks, type PreviewMark } from "./livePreview";

const md = parser.configure(GFM);
/** 印を、種類と対象の文字で並べる（読みやすく比べる） */
function marksOf(text: string, activeLine: number | null = null) {
  const lineOf = (pos: number) => text.slice(0, pos).split("\n").length - 1;
  const marks = previewMarks(md.parse(text), text, (pos) => lineOf(pos) === activeLine);
  return marks.map((m: PreviewMark) => (m.kind === "line" ? `line:${m.cls}@${lineOf(m.at)}` : `${m.kind}${"cls" in m ? `:${m.cls}` : ""}${"checked" in m ? `:${m.checked}` : ""}=${JSON.stringify(text.slice(m.from, m.to))}`));
}

test("livePreview: 見出しの # と空白を隠し、行に見出しの見た目を付ける。カーソルの行は記号を残す", () => {
  assert.deepEqual(marksOf("## 見出し\n本文"), ["line:md-h2@0", 'hide="## "']);
  assert.deepEqual(marksOf("## 見出し\n本文", 0), ["line:md-h2@0"]);
});

test("livePreview: 太字・斜体・コード・取り消し線の記号を隠し、中身に見た目を付ける", () => {
  assert.deepEqual(marksOf("**太** *斜* `c` ~~消~~"), [
    'span:md-strong="**太**"',
    'hide="**"',
    'hide="**"',
    'span:md-em="*斜*"',
    'hide="*"',
    'hide="*"',
    'span:md-code="`c`"',
    'hide="`"',
    'hide="`"',
    'span:md-strike="~~消~~"',
    'hide="~~"',
    'hide="~~"',
  ]);
});

test("livePreview: リンクは文だけを見せ、[ ] ( ) と URL を隠す", () => {
  assert.deepEqual(marksOf("[文](https://x.y)"), ['span:md-link="[文](https://x.y)"', 'hide="["', 'hide="]"', 'hide="("', 'hide="https://x.y"', 'hide=")"']);
});

test("livePreview: 箇条書きは「•」、タスクは記号を隠してチェックボックス、番号付きはそのまま", () => {
  assert.deepEqual(marksOf("- 項目\n- [ ] やる\n- [x] 済み\n1. 番号"), ['bullet="-"', 'hide="- "', 'task:false="[ ]"', 'hide="- "', 'task:true="[x]"']);
  // カーソルの行は記号をそのまま
  assert.deepEqual(marksOf("- 項目", 0), []);
});

test("livePreview: 引用は行ごとに見た目を付けて > を隠し、コードの塊は行に見た目を付けて ``` と言語を隠し、区切り線は線に", () => {
  assert.deepEqual(marksOf("> 引用\n\n```js\na\n```\n\n---"), [
    "line:md-quote@0",
    'hide="> "',
    "line:md-codeblock@2",
    "line:md-codeblock@3",
    "line:md-codeblock@4",
    'hide="```"',
    'hide="js"',
    'hide="```"',
    'rule="---"',
  ]);
  // カーソルのある行（``` の行）は残す
  assert.deepEqual(marksOf("```js\na\n```", 0), ["line:md-codeblock@0", "line:md-codeblock@1", "line:md-codeblock@2", 'hide="```"']);
});
