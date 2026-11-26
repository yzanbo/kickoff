# Markdown の表示（`src/foundation/ui/markdown`）

返答・GitHub の本文・.md のプレビューなどの Markdown の部品と、読み方・書式付きコピー・選んだ部分の Markdown。

## 地図
- `Markdown.tsx`（部品）・`markdownProcessor.ts`（作り置きの処理・`markdownToHast`）・`syntax/`（読み方の組）・`streaming/`（ブロック分け・薄く出す段）・`html/`（中の HTML）・`math/`・`mermaid/`・`markdownHtml.ts`（書式付きコピー）・`selectionMarkdown.ts`

## 決まり
- 読み方は `syntax/` の組 1 つ（1 回の改行も改行。強調の判定は `cjkFlanking`）。表示とコピーが同じ組を使う。
- 中の HTML は、Markdown の読み取りが HTML と認めた所（raw）だけを `html/` の小さな読み取りで読み、一覧（`html/htmlAllowlist.ts`）にある小文字のタグと属性だけを描く。ほかは書いたままの文字。HTML の読み取りの部品（parse5・hast-util-raw・rehype-raw）は足さない。
- 開きと閉じが同じ親の中でそろったものだけを要素にする（補わない）。タグ 2,000 個・入れ子 32 段・字下げ 10 段を超えたブロックは書いたままの文字。
- 木にしたあと一覧ともう一度照らす（`html/htmlVerify.ts`）。Kickoff の印（`md-html` のクラス・数式・薄く出す段）は確かめのあとに付ける。ファイルのチップの印は Markdown の節にだけ付ける（HTML の要素には付けない）。
- HTML の a はリンクの判定（`linkTargetOf`）を通した行き先だけ、img は http・https だけ（Markdown の画像と同じ部品）。HTML の id と # の行き先は `user-html-` の頭（脚注の `user-content-` を横取りさせない）。一覧を広げるときは、先に攻撃の例（`html/htmlAttacks.test.ts`）に足す。
- 確認の画面に渡すリンクの文字（`linkTextOf`）は見える文字（画像は alt も、数式は見た目の部分だけ。MathML・annotation・透明な文字は除く）。
- 画像の src の一覧（「host から画像を n 件表示」）は描く木から数える（`imageSourcesOf`。正規表現で拾わない）。
- たたむ部分（details）は `MarkdownDetails.tsx` が state で開け閉めし、閉じている間は中身を DOM に置かない（コピー・引用・検索・画像の読み込みに入れない）。見出しがない・空なら「詳細」。
- 数式は `math/katexOptions.ts` の設定 1 つ（返答とノート）。色の命令は色なし、小さくするサイズの命令は何もせず中身だけ描き、`\scriptscriptstyle` は `\scriptstyle` にする（見えない・読めない文字を作らせない）。本文より小さくしない（`Markdown.css`）。
- Mermaid は閉じた枠（`mermaid/mermaidFrame.ts`・`@shared/foundation/mermaidFrame.ts`。外を読めず画面の DOM もない）で描き、戻った SVG は `sanitizeSvg` を通す。整え・判定・設定は `@shared/foundation/mermaidSvg.ts`・`mermaidResources.ts`（スマホと共有）。
- 書式付きコピー（`markdownHtml.ts`）は表示と同じ木を書く（HTML の要素の id と印のクラスは書かず、たたむ部分は中身ごと）。
- CSS: HTML でしか出ないタグは `MarkdownHtml.css`（state の層）で、ほかの CSS を戻してから見た目を付ける。文字の大きさを変えるタグは 10px から見出しの大きさまでに止める（Markdown も作る sup・code は `Markdown.css` で、HTML の同じタグも戻さない）。

## 落とし穴
- ブロックは空行で分けるが、HTML の入れ物の開きから閉じまでは 1 つにする（`streaming/htmlBlockDepth.ts`。HTML ブロックの中のタグだけを数え、閉じないまま 32,000 字を超えたらまとめない）。
- テスト: `markdownProcessor.test.ts`（ブロックに分けても全文と同じ）・`html/*.test.ts`・`markdownDetails.test.ts`・`markdownImages.test.ts`。
