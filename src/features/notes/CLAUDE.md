# ノート（`src/features/notes`）

プロジェクトの「ノート」タブと、チャットからノートを作る・開く・足す口。ノートはプロジェクトの外のフォルダの Markdown と HTML（種類は拡張子 `noteKindOf`。DB に入れない）。

## 地図

| ファイル | 中身 |
|---|---|
| `core/service.ts`・`noteDir.ts`・`noteAi.ts`・`noteChat.ts`・`noteWatcher.ts` | 一覧・読み書き・移動・ゴミ箱・場所（書く前に `ensureNoteDir`）・AI・チャット・外の変更 |
| `ui/NoteTab`・`NoteTree`・`noteDrag.ts`・`useNoteActions` | ノートのタブ（一覧・右のタブ 欄 `notes`）・木・操作 |
| `ui/NoteView`・`NoteEditor`・`livePreview*.ts`・`useNoteDocument` | 開いたノート・編集（CodeMirror）・保存 |
| `ui/HtmlNotePage`・`htmlPage.ts` | HTML のノートのページ（読むファイルは `@/foundation/core/http/assets.ts` の `assetResponse`） |
| `ui/NoteChat`・`addToNote.ts`・`openNoteFrom.ts`・`attachNote.ts` | ノートのチャット・チャットの文をノートにする・チャットから開く・ノートを足す |

一覧は `ui/stores/notes.ts` の `notesStore`。操作のあとは知らせを待たずに `invalidate` する。

## 決まり

- パスはノートのフォルダからの相対で、操作はファイルと同じ `folderFiles`（外・「.」で始まる名前を断る。指紋で 409）。変えたら SSE の `notes`。
- 保存は ⌘S（と ⌘⇧S）だけ。書きかけは `notes:draft` に残す（タブを移る・閉じるでも失わない）。
- 離れる・名前を変える・動かす・ゴミ箱に入れる前に `noteGuards.ts` の `confirmLeaveNote` で聞く（開いているノートは `registerNoteGuard` で知らせる）。
- ノートのチャットに送る前・ノートを添付する前に書きかけを保存し、保存できなければ送らない・足さない。
- ノートのフォルダは、どのチャットでも実行のときに書ける場所に足し、システムプロンプトで伝える（`core/turnParts.ts`。AI のツールは `core/tools.ts`）。AI に渡すパスは区切りが分かる形に。
- 既存のノートへの追記・AI で組み込むは Markdown だけ（HTML の最後に足すとページの外。コアも 400）。
- ノートのチャットは `chats.note_path` で引き、サイドバー・ボード・タブには並べない（`selectChats` で除く）
- ノートを足すときは付けたときの写し（`api.noteSnapshot`。`taken_at`）。足す口は `appendToDraft`（別ウィンドウはメインに頼む）。

## 行へ移る（`ui/noteReveal.ts`）

- `?line=` は開く前に `requestNoteReveal` で頼み、編集の部品ができたとき（`onReady`）に受け取る。古い頼みは捨てる（あとで開いたときに急に移らない）。

## 落とし穴

- 動かす・ゴミ箱に入れると `onMoved`・`onTrashed` で知らせ、ノートのチャット（chat の `noteChats`）と DB の手順ノートを付け替える・同じ行に入れる。
- 外の変更の知らせは重なって届くので、画面は指紋で読み直しを省く。保存は開いたときの指紋と比べ、取りこぼしても古いまま見せないよう窓に戻ったときも確かめる（`checkFresh`）。
- HTML のノートのページは iframe の srcdoc。sandbox は `allow-same-origin` だけ（中の JavaScript・フォームを動かさない）。配色は明るい側に決める（理由は `note-editor.css`）。中の押下・キー（⌘F・⌘S）は親に届かないので、`HtmlNotePage` が受けて伝え直す。
- ノートのチャットの欄とノートの下の入力欄は同じ下書き（`chatComposerDraft`）。欄は閉じても描いたまま置く。
- 開いているフォルダ `openFolders` はノートのタブと入力欄の上の `NoteChipTree` で、ドラッグの決まりは `noteDrag.ts` で共通。
- テスト: `core/routes/server.notes.test.ts`（`noteFake`）。
