# 開いたノート（`features/notes/ui/document`）

開いたノートの見出し・編集の部品（CodeMirror）・Markdown 表示・HTML のページ。ノート全体は `../../CLAUDE.md`。

## 地図

| ファイル | 中身 |
|---|---|
| `NoteView.tsx`・`useNoteDocument.ts`・`NoteEditor.tsx` | 開いたノートの枠・保存・表示の切り替え・編集の部品（Markdown 表示のときだけ下の飾りを入れる） |
| `livePreview.ts`・`livePreviewExtension.ts` | 行の中の飾り（どこを飾るかは純粋な関数 `previewMarks`） |
| `liveRich.ts`・`mermaidBlocks.ts` | 数式と Mermaid を置き換えて描く |
| `blockWidgets.tsx`・`NoteTable.tsx`・`TableCell.tsx`・`widgetPortals.tsx` | 表を置き換えて描く（返答の表示と同じ処理と部品。React の部品は NoteEditor の木から portal で描く） |
| `tableField.ts`・`tableState.ts`・`cellEditor.ts`・`cellKeys.ts` | セルで書く（開いているセル・セルの中の小さな CodeMirror・キー） |
| `tableBlocks.ts`・`tableModel.ts`・`tableEdit.ts`・`tableSyntax.ts` | 表の場所とセル・書き戻し・段落の途中から始まる表を読む拡張 |
| `noteMarkdown.ts`・`noteLinks.ts`・`cjkEmphasis.ts` | 読み取りの組・行き先のあるリンク・日本語向けの強調 |
| `HtmlNotePage.tsx`・`htmlPage.ts` | HTML のノートのページ（iframe） |

## 決まり

- Markdown 表示は見た目だけを変える。ファイルを書き換えるのは本文・セルを書いたとき・チェックボックスを押したときだけ。
- 返答の表示（`@/foundation/ui/markdown`）と同じ所を同じ書き方として飾る。読み取り（lezer）は返答の表示（micromark）と別物なので、ずれは `markdownParity.test.ts` に見本を足してノートの側で合わせる（定義のない `[文字]` はリンクにしない・`|` で始まる段落の途中からの表も読む）。
- 表はカーソルが入っても表のまま。開いているセルだけ元の文字を書く部品にし、変更は本体の書き換えにして送る（履歴は本体の 1 本）。本体の選んだ範囲もセルの中に写す（行番号・選んだ文は本体から読む）。
- 書き戻しは表の書き方に合わせる（詰めた表は書いた所だけ、そろえた表は見た目の幅でそろえたまま）。
- 置き換えて描くまとまりの中に、ほかの飾り（数式・図）を重ねない。

## 落とし穴

- HTML のノートのページは iframe の srcdoc。sandbox は `allow-same-origin` だけ。中の押下・キー（⌘F・⌘S）は親に届かないので、`HtmlNotePage` が受けて伝え直す。
- 行をまたいで置き換える飾りは StateField で出す。描いたあとに高さを測り直させる（`requestMeasure`）。portal の key は要素ごとに変えない。
- セルの部品は描いた直後（layout effect）に作ってピントを移す（前の部品が消えた隙にピントが外へ出た扱いになると閉じる）。開いている間は列の幅を固定する（大きな表を 1 文字ごとに測り直さない）。表の枠は `contain: inline-size`（セルの最小の幅で本文が横に広がらない）。
- テスト: `livePreview`・`markdownParity`・`tableBlocks`・`tableEdit`・`tableState`・`mermaidBlocks`・`htmlPage` の `*.test.ts`。
