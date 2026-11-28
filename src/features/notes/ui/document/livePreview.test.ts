import assert from "node:assert/strict";
import { test } from "vitest";
import { GFM, parser } from "@lezer/markdown";
import { cjkFriendlyEmphasis } from "./cjkEmphasis";
import { previewMarks, type PreviewMark } from "./livePreview";

const md = parser.configure(GFM);
/** 返答の表示と同じ日本語向けの強調の拡張を足した読み取り（NoteEditor と同じ組） */
const cjk = parser.configure([GFM, cjkFriendlyEmphasis]);
/** 印を、種類と対象の文字で並べる（読みやすく比べる） */
function marksOf(text: string, activeLine: number | null = null, reader = md) {
  const lineOf = (pos: number) => text.slice(0, pos).split("\n").length - 1;
  const marks = previewMarks(reader.parse(text), text, (pos) => lineOf(pos) === activeLine);
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

test("livePreview: 引用は行ごとに見た目を付けて > を隠し、コードの塊は行に見た目を付けて閉じの ``` を隠し（開きの行は帯）、区切り線は線に", () => {
  assert.deepEqual(marksOf("> 引用\n\n```js\na\n```\n\n---"), [
    "line:md-quote@0",
    'hide="> "',
    "line:md-codeblock@2",
    "line:md-codeblock@3",
    "line:md-codeblock@4",
    'hide="```"',
    'rule="---"',
  ]);
  // カーソルのある行（閉じの ``` の行）は残す
  assert.deepEqual(marksOf("```js\na\n```", 2), ["line:md-codeblock@0", "line:md-codeblock@1", "line:md-codeblock@2"]);
  // 引用の中の塊は帯を出さないので、開きの ``` と言語名も隠す
  assert.deepEqual(marksOf("> ```js\n> a\n> ```").filter((m) => m.startsWith("hide")), ['hide="> "', 'hide="```"', 'hide="js"', 'hide="> "', 'hide="> "', 'hide="```"']);
});

const cjkMarksOf = (text: string) => marksOf(text, null, cjk);

test("livePreview: 印の内側が記号で外側が日本語の太字・取り消し線も、返答の表示と同じく読む（日本語向けの拡張）", () => {
  assert.deepEqual(cjkMarksOf("**「強調」**は"), ['span:md-strong="**「強調」**"', 'hide="**"', 'hide="**"']);
  assert.deepEqual(cjkMarksOf("**ノート（.md）**と**チャット（.json）**の違い"), [
    'span:md-strong="**ノート（.md）**"',
    'hide="**"',
    'hide="**"',
    'span:md-strong="**チャット（.json）**"',
    'hide="**"',
    'hide="**"',
  ]);
  assert.deepEqual(cjkMarksOf("~~取消（x）~~です"), ['span:md-strike="~~取消（x）~~"', 'hide="~~"', 'hide="~~"']);
  // 日本語向けの拡張がないと太字にならない（拡張が効いていることの確かめ）
  assert.deepEqual(marksOf("**「強調」**は"), []);
});

test("livePreview: 英語の文・語の中の _・~ 1 つの木は、日本語向けの拡張があっても変わらない", () => {
  for (const text of ["foo**bar**baz", "snake_case_name", "__init__", "x * y * z", "a *b* c ~~d~~ e", "5~10秒", "**太字**は", "__下線（x）__です"]) {
    assert.equal(cjk.parse(text).toString(), md.parse(text).toString(), text);
  }
});

test("livePreview: 定義のない [文字] は角かっこごと文字のまま、定義のある参照はリンクにする", () => {
  assert.deepEqual(marksOf("配列 [2, 3] とキー ⌘[ ⌘]"), []);
  assert.deepEqual(marksOf("[名前] と [x]\n\n[名前]: https://x.y"), ['span:md-link="[名前]"', 'hide="["', 'hide="]"', "line:md-linkdef@2"]);
});

test("livePreview: 画像と定義の行の印は隠さない（定義の行は薄い小さな文字。脚注の定義は除く）", () => {
  assert.deepEqual(marksOf("![[a.png]] ![説明](b.png)"), []);
  assert.deepEqual(marksOf("[a]: https://x.y"), ["line:md-linkdef@0"]);
  assert.deepEqual(marksOf("[^1]: 注"), []);
});

test("livePreview: <URL> は < > を隠してリンクに、URL のそのまま書きは日本語の記号の手前までリンクに", () => {
  assert.deepEqual(marksOf("<https://x.y>"), ['span:md-link="<https://x.y>"', 'hide="<"', 'hide=">"']);
  assert.deepEqual(marksOf("見る https://x.y/a。次"), ['span:md-link="https://x.y/a"']);
});
