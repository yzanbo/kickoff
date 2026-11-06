import assert from "node:assert/strict";
import { test } from "node:test";
import { appendBlock, quoteCode, quoteComment } from "./quoteComment";

test("選んだ範囲へのコメント: 引用にしてコメントを添え、チャット欄の文の後ろに足す", () => {
  assert.equal(quoteComment("  ここは違う  \n\n\n次の行 ", "直して"), "> ここは違う\n>\n> 次の行\n\n直して");
  assert.equal(quoteComment("引用だけ", "  "), "> 引用だけ");
  assert.match(quoteComment("あ".repeat(2000), ""), /^> あ{1500}…$/);
  assert.equal(appendBlock("", "> a"), "> a");
  assert.equal(appendBlock("書きかけ\n\n", "> a"), "書きかけ\n\n> a");
});

test("quoteCode: パスと行の範囲を見出しに、コードをブロックで引用し、コメントを添える", () => {
  assert.equal(
    quoteCode({ path: "src/a.ts", from: 3, to: 5, side: "new", code: "const a = 1;  \nconst b = 2;\n", comment: " 名前を変えて " }),
    "`src/a.ts` の 3〜5 行目（変更後）:\n```\nconst a = 1;\nconst b = 2;\n```\n\n名前を変えて",
  );
  assert.equal(quoteCode({ path: "a.md", from: 7, to: 7, side: "old", code: "x", comment: "" }), "`a.md` の 7 行目（変更前）:\n```\nx\n```");
  // ファイルの中身の行（差分でない）は側を付けない
  assert.equal(quoteCode({ path: "a.md", from: 2, to: 4, side: null, code: "x", comment: "" }), "`a.md` の 2〜4 行目:\n```\nx\n```");
});

test("quoteCode: コードに ``` があれば、それより長い囲みにする", () => {
  assert.equal(quoteCode({ path: "a.md", from: 1, to: 1, side: "new", code: "```js", comment: "" }), "`a.md` の 1 行目（変更後）:\n````\n```js\n````");
});
