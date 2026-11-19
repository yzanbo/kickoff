# ノート（`src/features/notes`）

プロジェクトの「ノート」タブと、チャットからノートを作る・開く・足す口。ノートはプロジェクトの外のフォルダの Markdown と HTML（種類は拡張子 `noteKindOf`。DB に入れない）。

## 地図

| ファイル | 中身 |
|---|---|
| `core/notes.ts`・`noteWatcher.ts` | 一覧・読み書き・移動・ゴミ箱（フォルダは `NoteService.dirOf`）・外の変更の知らせ |
| `ui/NoteTab`・`NoteTree`・`noteDrag.ts`・`useNoteActions` | ノートのタブ（一覧・右のタブ `SURFACES.notes`）・木・操作 |
| `ui/NoteView`・`NoteEditor`・`livePreview*.ts`・`useNoteDocument` | 開いたノート・編集（CodeMirror）・保存 |
| `ui/HtmlNotePage`・`htmlPage.ts` | HTML のノートのページ（読むファイルは `@/foundation/core/http/assets.ts` の `assetResponse`） |
| `ui/NoteChat`・`addToNote.ts`・`openNoteFrom.ts`・`attachNote.ts` | ノートのチャット・チャットの文をノートにする・チャットから開く・ノートを足す |

一覧は `ui/stores/notes.ts` の `notesStore`。操作のあとは知らせを待たずに `invalidate` する。

## 決まり

- パスはノートのフォルダからの相対で受け、`assertInside` で外を断る。「.」で始まる名前は扱わない。読み書きはファイルと同じ口（指紋で 409）。変えたら SSE の `notes`。
- 保存は ⌘S（と ⌘⇧S）だけ。書きかけは `noteDraft` に残す（タブを移っても・閉じても失わない）。
- 離れる・名前を変える・動かす・ゴミ箱に入れる前に `noteGuards.ts` の `confirmLeaveNote` で聞く（開いているノートは `registerNoteGuard` で知らせる）。
- ノートのチャットに送る前・ノートを添付する前に書きかけを保存し、保存できなければ送らない・足さない。
- ノートのフォルダは、どのチャットでも実行のときに書ける場所に足し、システムプロンプトで伝える（`buildTurnParams`）。AI にパスを渡すときは区切りが分かる形にする。
- 既存のノートへの追記・AI で組み込むは Markdown だけ（HTML の最後に足すとページの外に出る。コアも 400）。
- ノートのチャットは `chats.note_path` で引き、サイドバー・ボード・タブには並べない（`selectChats` が除く）。
- ノートを足すときは付けたときの写し（`api.noteSnapshot`。`taken_at`）。足す口は `addToChat`（別ウィンドウはメインに頼む）。

## 行へ移る（`ui/noteReveal.ts`）

- `?line=` は開く前に `requestNoteReveal` で頼み、編集の部品ができたとき（`onReady`）に受け取る。古い頼みは捨てる（あとで開いたときに急に移らない）。

## 落とし穴

- ノートの名前を変える・動かすと、ノートのチャットと DB の手順ノートを `remapNotePath` で付け替える。ゴミ箱に入れると、ノートのチャットも同じ行に入れる（`trashNoteChats`。kickoff-trash でも）。
- 外の変更の知らせは重なって届くので、画面は指紋で読み直しを省く。保存は開いたときの指紋と比べ、取りこぼしても古いまま見せないよう、窓に戻ったときも確かめる（`checkFresh`）。
- HTML のノートのページは iframe の srcdoc。sandbox は `allow-same-origin` だけ（中の JavaScript・フォームを動かさない）。配色は明るい側に決める（理由は `note-editor.css`）。中の押下・キー（⌘F・⌘S）は親に届かないので、`HtmlNotePage` が受けて伝え直す。
- ノートのチャットの欄とノートの下の入力欄は同じ `chatDraft` を使う。欄は閉じても描いたまま置く（書きかけを残す）。
- 開いているフォルダ `noteOpenFolders` はノートのタブと入力欄の上の `NoteChipTree` で共通。ドラッグの決まりも `noteDrag.ts` で共通。
- テストは `core/routes/server.notes.test.ts`（`noteFake`）。
