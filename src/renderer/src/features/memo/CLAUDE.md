# メモ（`features/memo`）
<!-- 行き先: src/features/notes/ -->

プロジェクトの「メモ」タブと、チャットからメモを作る・開く・足す口。メモはプロジェクトの外のフォルダの Markdown と HTML（種類は拡張子 `memoKindOf`。DB に入れない）。保存先と API は `src/core/CLAUDE.md` の「メモ」。

| ファイル | 中身 |
|---|---|
| `MemoTab`・`MemoTree`・`memoDrag.ts`・`useMemoActions` | メモのタブ（一覧・右のタブ `SURFACES.memos`）・木・操作 |
| `MemoView`・`MemoEditor`・`livePreview*.ts`・`useMemoDocument` | 開いたメモ・編集（CodeMirror）・保存 |
| `HtmlMemoPage`・`htmlPage.ts` | HTML のメモのページ |
| `MemoChat`・`MemoQuickChat`・`memoChatTargets.ts` | メモのチャット・足す先 |
| `addToMemo.ts`・`MemoMenuItems`・`openMemoFrom.ts`・`SideMemo` | チャットの文をメモにする・チャットから開く |
| `attachMemo.ts`・`memoAttachment.ts` | 開いたチャットにメモを足す |

一覧は `stores/memos.ts` の `memosStore`。操作のあとは知らせを待たずに `invalidate` する。

## 保存
<!-- 行き先: src/features/notes/ -->

- 保存は ⌘S（と ⌘⇧S）だけ。書きかけは `memoDraft` に残す（タブを移っても・閉じても失わない）。
- 離れる・名前を変える・動かす・ゴミ箱に入れる前に `memoGuards.ts` の `confirmLeaveMemo` で聞く（開いているメモは `registerMemoGuard` で知らせる）。
- 保存は開いたときの指紋と比べる。知らせを取りこぼしても古いまま見せないよう、窓に戻ったときも確かめる（`checkFresh`）。
- メモのチャットに送る前・メモを添付する前に書きかけを保存し、保存できなければ送らない・足さない。

## 行へ移る（`memoReveal.ts`）
<!-- 行き先: src/features/notes/ -->

- `?line=` は開く前に `requestMemoReveal` で頼み、編集の部品ができたとき（`onReady`）に受け取る。古い頼みは捨てる（あとで開いたときに急に移らない）。

## HTML のメモ
<!-- 行き先: src/features/notes/ -->

- ページは iframe の srcdoc。sandbox は `allow-same-origin` だけ（中の JavaScript・フォームを動かさない）。配色は明るい側に決める（理由は `memo-editor.css`）。
- ページの中の押下・キー（⌘F・⌘S）は親に届かないので、`HtmlMemoPage` が受けて伝え直す。
- 既存のメモへの追記・AI で組み込むは Markdown だけ（HTML の最後に足すとページの外に出る。コアも 400）。

## チャットとの間
<!-- 行き先: src/features/notes/ -->

- メモのチャットは `chats.memo_path` で引き、サイドバー・ボード・タブには並べない（`selectChats` が除く）。
- メモのチャットの欄とメモの下の入力欄は同じ `chatDraft` を使う。欄は閉じても描いたまま置く（書きかけを残す）。
- メモを足すときは付けたときの写し（`api.memoSnapshot`。`taken_at`）。足す口は `addToChat`（別ウィンドウはメインに頼む）。
- 開いているフォルダ `memoOpenFolders` はメモのタブと入力欄の上の `MemoChipTree` で共通。ドラッグの決まりも `memoDrag.ts` で共通。
