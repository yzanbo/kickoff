# メモ（`src/features/notes`）

プロジェクトの「メモ」タブと、チャットからメモを作る・開く・足す口。メモはプロジェクトの外のフォルダの Markdown と HTML（種類は拡張子 `memoKindOf`。DB に入れない）。

## 地図

| ファイル | 中身 |
|---|---|
| `core/memos.ts`・`memoWatcher.ts` | 一覧・読み書き・移動・ゴミ箱（フォルダは `MemoService.dirOf`）・外の変更の知らせ |
| `ui/MemoTab`・`MemoTree`・`memoDrag.ts`・`useMemoActions` | メモのタブ（一覧・右のタブ `SURFACES.memos`）・木・操作 |
| `ui/MemoView`・`MemoEditor`・`livePreview*.ts`・`useMemoDocument` | 開いたメモ・編集（CodeMirror）・保存 |
| `ui/HtmlMemoPage`・`htmlPage.ts` | HTML のメモのページ（読むファイルは `@/foundation/core/http/assets.ts` の `assetResponse`） |
| `ui/MemoChat`・`addToMemo.ts`・`openMemoFrom.ts`・`attachMemo.ts` | メモのチャット・チャットの文をメモにする・チャットから開く・メモを足す |

一覧は `ui/stores/memos.ts` の `memosStore`。操作のあとは知らせを待たずに `invalidate` する。

## 決まり

- パスはメモのフォルダからの相対で受け、`assertInside` で外を断る。「.」で始まる名前は扱わない。読み書きはファイルと同じ口（指紋で 409）。変えたら SSE の `memos`。
- 保存は ⌘S（と ⌘⇧S）だけ。書きかけは `memoDraft` に残す（タブを移っても・閉じても失わない）。
- 離れる・名前を変える・動かす・ゴミ箱に入れる前に `memoGuards.ts` の `confirmLeaveMemo` で聞く（開いているメモは `registerMemoGuard` で知らせる）。
- メモのチャットに送る前・メモを添付する前に書きかけを保存し、保存できなければ送らない・足さない。
- メモのフォルダは、どのチャットでも実行のときに書ける場所に足し、システムプロンプトで伝える（`buildTurnParams`）。AI にパスを渡すときは区切りが分かる形にする。
- 既存のメモへの追記・AI で組み込むは Markdown だけ（HTML の最後に足すとページの外に出る。コアも 400）。
- メモのチャットは `chats.memo_path` で引き、サイドバー・ボード・タブには並べない（`selectChats` が除く）。
- メモを足すときは付けたときの写し（`api.memoSnapshot`。`taken_at`）。足す口は `addToChat`（別ウィンドウはメインに頼む）。

## 行へ移る（`ui/memoReveal.ts`）

- `?line=` は開く前に `requestMemoReveal` で頼み、編集の部品ができたとき（`onReady`）に受け取る。古い頼みは捨てる（あとで開いたときに急に移らない）。

## 落とし穴

- メモの名前を変える・動かすと、メモのチャットと DB の手順メモを `remapMemoPath` で付け替える。ゴミ箱に入れると、メモのチャットも同じ行に入れる（`trashMemoChats`。kickoff-trash でも）。
- 外の変更の知らせは重なって届くので、画面は指紋で読み直しを省く。保存は開いたときの指紋と比べ、取りこぼしても古いまま見せないよう、窓に戻ったときも確かめる（`checkFresh`）。
- HTML のメモのページは iframe の srcdoc。sandbox は `allow-same-origin` だけ（中の JavaScript・フォームを動かさない）。配色は明るい側に決める（理由は `memo-editor.css`）。中の押下・キー（⌘F・⌘S）は親に届かないので、`HtmlMemoPage` が受けて伝え直す。
- メモのチャットの欄とメモの下の入力欄は同じ `chatDraft` を使う。欄は閉じても描いたまま置く（書きかけを残す）。
- 開いているフォルダ `memoOpenFolders` はメモのタブと入力欄の上の `MemoChipTree` で共通。ドラッグの決まりも `memoDrag.ts` で共通。
- テストは `core/routes/server.memos.test.ts`（`memoFake`）。
