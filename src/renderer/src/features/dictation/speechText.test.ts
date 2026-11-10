import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE_NOTE, TABLE_NOTE, speakableText, splitSpeech } from "./speechText";

test("読み上げる文: 見出し・箇条書き・強調・インラインコードの印を外し、リンクは文字だけ・URL は「（リンク）」", () => {
  const md = ["## 結果", "", "- **型**は `npm run typecheck` で通りました", "1. [README](https://example.com/readme) を直す", "詳しくは https://example.com を見てください。", "> 引用の文", "---", "![図](a.png)"].join("\n");
  assert.equal(speakableText(md), ["結果", "型は npm run typecheck で通りました", "README を直す", "詳しくは （リンク） を見てください。", "引用の文"].join("\n"));
});

test("読み上げる文: コードブロック・表は中身を読まず、続いたら置き換えの文を 1 回だけ", () => {
  const md = ["直しました。", "```ts", "const a = 1;", "```", "```", "b", "```", "", "| 名前 | 値 |", "|---|---|", "| a | 1 |", "以上です。"].join("\n");
  assert.equal(speakableText(md), ["直しました。", CODE_NOTE, TABLE_NOTE, "以上です。"].join("\n"));
  // 閉じていないコードブロックは最後まで読まない
  assert.equal(speakableText("前\n~~~\nコード\n続き"), `前\n${CODE_NOTE}`);
});

test("読み上げの区切り: 文の終わりで切り、短い文はつなぎ、最初の区切りは短くする", () => {
  assert.deepEqual(splitSpeech("はい。わかりました！次に進みます？"), ["はい。わかりました！次に進みます？"]);
  assert.deepEqual(splitSpeech("一文目です。二文目です。三文目です。", 200, 7), ["一文目です。", "二文目です。三文目です。"]);
  assert.deepEqual(splitSpeech("Done. Next step is tests.", 200, 10), ["Done.", "Next step is tests."]);
  assert.deepEqual(splitSpeech("行1\n行2"), ["行1行2"]);
  assert.deepEqual(splitSpeech(""), []);
  // 長い 1 文は読点で切る
  const long = `${"あ".repeat(30)}、${"い".repeat(30)}。`;
  assert.deepEqual(splitSpeech(long, 40, 40), [`${"あ".repeat(30)}、`, `${"い".repeat(30)}。`]);
  // 「」の閉じは文に含める
  assert.deepEqual(splitSpeech("「はい。」と言いました。", 200, 3), ["「はい。」", "と言いました。"]);
});
