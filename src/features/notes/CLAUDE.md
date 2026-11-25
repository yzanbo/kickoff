# ノート（`features/notes`）

プロジェクトの「ノート」タブと、チャットからノートを作る・開く・足す口、共通のノート（`core/CLAUDE.md`）。ノートはプロジェクトの外のフォルダの Markdown と HTML（種類は拡張子 `noteKindOf`。DB に入れない）。

## 地図

| ファイル | 中身 |
|---|---|
| `core/service.ts`・`noteDir.ts`・`noteAi.ts`・`noteChat.ts`・`noteWatcher.ts` | 一覧・読み書き・移動・ゴミ箱・場所（書く前に `ensureNoteDir`）・AI・チャット・外の変更 |
| `ui/tree/` | ノートのタブ `NoteTab`・欄 `NoteSection`・木 `NoteTree`・操作 `useNoteActions`（画面の決まりは `ui/CLAUDE.md`） |
| `ui/document/` | 開いたノート `NoteView`・編集 `NoteEditor`（CodeMirror）・保存 `useNoteDocument`・HTML のページ `HtmlNotePage`（読むファイルは `@/foundation/core/http/assets.ts` の `assetResponse`） |
| `ui/chat/`・`ui/links/` | ノートのチャット `NoteChat`・チャットの文をノートにする `addToNote.ts`・ノートを足す `attachNote.ts`（開き方は `ui/openNote.ts`） |

一覧は `ui/store.ts` の `notesStore`。操作のあとは知らせを待たずに `invalidate` する。

## 決まり

- パスはノートのフォルダからの相対で、操作はファイルと同じ `folderFiles`（外・「.」で始まる名前を断る。指紋で 409）。変えたら SSE の `notes`。
- 保存は ⌘S（と ⌘⇧S）だけ。書きかけは `notes:draft` に残す（タブを移る・閉じるでも失わない）。
- 離れる・名前を変える・動かす・ゴミ箱に入れる前に `noteLeave.ts` で聞く（開いているノートは `useDocument` が未保存の登録簿に出す）。
- ノートのチャットに送る前・ノートを添付する前に書きかけを保存し、保存できなければ送らない・足さない。
- ノートのフォルダ（と共通のノートのフォルダ）は、どのチャットでも書ける場所に足し、システムプロンプトで伝える（`core/turnParts.ts`・`core/tools.ts`）。AI に渡すパスは区切りが分かる形に。
- 共通のチャットはプロジェクトのノートを `write_project_note`（`core/projectNoteWrite.ts`）・`move_note` の `project` で書く（承認）。
- 既存のノートへの追記・AI で組み込むは Markdown だけ（HTML の最後はページの外。コアも 400）。
- ノートのチャットは `chats.note_path` で引き、サイドバー・ボード・タブには並べない（`selectChats` で除く）
- ノートを足すときは付けたときの写し（`note/snapshot`。`taken_at`）。足す口は `appendToDraft`（別ウィンドウはメインに頼む）。

## 落とし穴

- 行へ移る `?line=`（`ui/noteReveal.ts`）は開く前に `requestNoteReveal` で頼み、編集の部品ができたとき（`onReady`）に受け取る。古い頼みは捨てる（後で急に移らない）。
- 動かす・ゴミ箱に入れると `onMoved`・`onTrashed` で知らせ、ノートのチャット（chat の `noteChats`）と DB の手順ノートを付け替える。
- 外の変更の知らせは重なって届くので、画面は指紋で読み直しを省く。保存は開いたときの指紋と比べ、取りこぼしても古いまま見せないよう窓に戻っても確かめる（`checkFresh`）。
- 編集の画面の強調・取り消し線は表示と同じ判定（`cjkEmphasis.ts`）。
- HTML のノートのページは iframe の srcdoc。sandbox は `allow-same-origin` だけ（中の JavaScript・フォームを動かさない）。配色は明るい側に決める（理由は CSS）。中の押下・キー（⌘F・⌘S）は親に届かないので、`HtmlNotePage` が受けて伝え直す。
- ノートのチャットの欄とノートの下の入力欄は同じ下書き（`chatComposerDraft`）。欄は閉じても描いたまま置く。
- テスト: `core/routes.test.ts`（`noteFake`）。
