# Markdown の表示（`src/foundation/ui/markdown`）

返答・GitHub の本文・ファイルの .md のプレビューなどで使う Markdown の部品と、読み方・書式付きコピー・選んだ部分の Markdown。

## 地図
- `Markdown.tsx`（部品）・`markdownProcessor.ts`（作り置きの処理・`markdownToHast`）・`syntax/`（読み方の組）・`streaming/`（ブロック分け・薄く出す段）・`html/`（中の HTML）・`math/`・`mermaid/`・`markdownHtml.ts`（書式付きコピー）・`selectionMarkdown.ts`

## 決まり
- 読み方は `syntax/` の組 1 つ（1 回の改行も改行。強調の判定は `cjkFlanking`）。表示とコピーが同じ組を使う。
- 中の HTML は、Markdown の読み取りが HTML と認めた所（raw）だけを `html/` の小さな読み取りで読み、一覧（`html/htmlAllowlist.ts`）にある小文字のタグと属性だけを描く。ほかは書いたままの文字。HTML 用の読み取りの部品（parse5・hast-util-raw・rehype-raw）は足さない。
- 開きと閉じが同じ親の中でそろったものだけを要素にする（補わない）。タグ 2,000 個・入れ子 32 段・字下げ 10 段を超えたブロックは書いたままの文字。
- 木にしたあと一覧ともう一度照らす（`html/htmlVerify.ts`）。Kickoff の印（`md-html` のクラス・数式・薄く出す段）は確かめのあとに付ける。ファイルのチップの印は Markdown の節にだけ付き、HTML から作った要素には付かない。
- HTML の a はリンクの判定（`linkTargetOf`）を通した行き先だけ、img は http・https だけ（Markdown の画像と同じ部品）。一覧を広げるときは、先に攻撃の例（`html/htmlAttacks.test.ts`）に足す。
- CSS: HTML でしか出ないタグは `MarkdownHtml.css`（state の層）で、ほかの CSS を戻してから見た目を付ける。文字の大きさを変えるタグは 10px から見出しの大きさまでに止める。

## 落とし穴
- ブロックは空行で分けるが、HTML の入れ物の開きから閉じまでは 1 つにする（`streaming/htmlBlockDepth.ts`）。
- テスト: `markdownProcessor.test.ts`（ブロックに分けても全文と同じ）・`html/*.test.ts`。
