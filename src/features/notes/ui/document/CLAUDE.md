# 開いたノート（`features/notes/ui/document`）

開いたノートの見出し・編集の部品（CodeMirror）・Markdown 表示・HTML のページ。ノート全体の決まりは `../../CLAUDE.md`。

## 地図

| ファイル | 中身 |
|---|---|
| `NoteView.tsx`・`useNoteDocument.ts` | 開いたノートの枠・保存・表示の切り替え（Markdown / そのまま、HTML はページ / ソース） |
| `NoteEditor.tsx` | 編集の部品。Markdown 表示のときだけ下の飾りを入れる |
| `livePreview.ts`・`livePreviewExtension.ts` | 行の中の飾り（カーソルのない行の記号を隠す）。どこを飾るかは純粋な関数 `previewMarks` |
| `liveRich.ts`・`mermaidBlocks.ts` | 数式と Mermaid を置き換えて描く（カーソルが入ると元の文字） |
| `blockWidgets.tsx`・`NoteTable.tsx`・`widgetPortals.tsx` | 表を置き換えて描く（中身は返答の表示と同じ処理と部品。React の部品は NoteEditor の木から portal で描く） |
| `tableBlocks.ts`・`tableSyntax.ts` | 表の場所・行・セルの見つけ方と、段落の途中から始まる表を読む拡張 |
| `noteMarkdown.ts` | 読み取りの組（編集の部品とテストで同じもの） |
| `noteLinks.ts` | 行き先のあるリンクの見分け（定義の一覧・参照の引き当て） |
| `cjkEmphasis.ts` | 強調・取り消し線の日本語向けの判定（返答の表示と同じ `cjkFlanking`） |
| `HtmlNotePage.tsx`・`htmlPage.ts` | HTML のノートのページ（iframe） |

## 決まり

- Markdown 表示は見た目だけを変える。ファイルを書き換えるのは本文を書いたとき・チェックボックスを押したときだけ。
- 返答の表示（`@/foundation/ui/markdown`）と同じ所を同じ書き方として飾る。編集の画面の読み取り（lezer）は返答の表示（micromark）と別物なので、ずれは `markdownParity.test.ts` に見本を足してノートの側で合わせる。
- 強調・取り消し線は `cjkEmphasis.ts`、リンクは `noteLinks.ts`、表は `tableSyntax.ts` で返答の表示と同じに判定する（lezer は定義のない `[文字]` も Link の節にし、`|` で始まる段落の途中からの表を読まない）。
- 置き換えて描くまとまりの中に、ほかの飾り（数式・図）を重ねない（`liveRich.ts` は表の中を飛ばす）。

## 落とし穴

- HTML のノートのページは iframe の srcdoc。sandbox は `allow-same-origin` だけ（中の JavaScript・フォームを動かさない）。配色は明るい側に決める（理由は CSS）。中の押下・キー（⌘F・⌘S）は親に届かないので、`HtmlNotePage` が受けて伝え直す。
- 行をまたいで置き換える飾り（数式・Mermaid）は ViewPlugin でなく StateField で出す（CodeMirror の決まり）。
- 置き換えた部品の高さは描いたあとに測り直させる（`view.requestMeasure()`）。portal の key は要素ごとに変えない（ほかの部品を外しても状態を残す）。
- テスト: `livePreview.test.ts`・`markdownParity.test.ts`・`tableBlocks.test.ts`・`mermaidBlocks.test.ts`・`htmlPage.test.ts`。
