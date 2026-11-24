# ノートのコア（共通のノート）

共通のノート = どのプロジェクトにも属さないノート。Kickoff が用意する見えないプロジェクト（`kind: "common"`。一覧から外すのは projects の `isListedProject`）のノートとして、ノートの API・ノートのチャット・見張り・検索・ゴミ箱をそのまま使う。

## 地図
- `commonNotes.ts`: 用意する・付け替える `sync`・使えない理由 `unavailable`・設定の変更に挟む `settingsHook`
- `turnParts.ts`（書ける場所とシステムプロンプト）・`tools.ts`（`open_note`・`move_note` の `scope`）
- `noteTransfer.ts`: 欄の間（共通のノートとプロジェクト・プロジェクトどうし）で動かす `createNoteTransfer`（`POST …/notes/move` の `to_project_id`・`move_note`）

## 決まり
- 本体（`repo_path`）と `note_dir` はいつも同じフォルダ（設定 `common_notes_dir`、なければ親フォルダの下の `COMMON_NOTES_FOLDER` = `_common`。実体のパス）。これで `NoteDirs.dirOf` もノートのチャットの作業場所もそこになる。
- 合わせるのは起動したとき（`start`）と、設定の PUT のあと（settings の `onUpdate`）。付け替えは projects の `changeOwnedFolder`（チャットはフォルダを変えたときと同じく移す）。作業中のチャットがあれば設定の変更を 409。
- フォルダが利用者のプロジェクト（ゴミ箱のものも）の本体と同じなら、作らない・付け替えない（使えない状態。理由は `GET /api/notes/defaults` の `common_unavailable`）。`common_notes_dir` で選んだときは保存前に 409。
- `projectNoteFolder` は `_common` をいつも使用中に数える（同じ名前のプロジェクトは `_common-2`）。
- 共通のノートのフォルダは、ほかのチャットの書ける場所に足して分けて伝える（自身のチャットでは二重にしない・使えなければ足さない）。
- ツールの `scope` は `project`（省いたとき）・`common`。共通のノートのフォルダの中の絶対パスは scope によらず共通。`move_note` は from と to の欄が違えば欄の間で動かす。
- 欄の間で動かすときは、ノートのチャット（フォルダなら中のノートのもの。アーカイブ済みも）と子孫も workplaceMove の `move`（`project_moved`）で行き先へ移し、`note_path` を付け替える。ファイルは `folderFiles` の `moveTo`（別のディスクなら写してから消す）。
- どれかが作業中ならファイルを動かす前に 409、チャットを移せなければファイルとチャットを元に戻す。行き先がない（ゴミ箱）は 404、アーカイブ・使えない共通のノートは 409。DB の接続の手順ノートは元のプロジェクトの接続なので付いていかない（`onMoved` を出さない）。
- ノートのフォルダの場所が変わったら `notes`（path は null）を出す（`noteDirChanges.ts`。決めていないフォルダは数えない）。開いている文書は外で変えられたときと同じく読み直す。
- 見えないプロジェクトにはノートのチャットとその子チャットだけ（HTTP の新しいチャットは 409、AI の `create_chat` の root は断る）。
- 共通のノートのフォルダが、利用者のプロジェクトのノートのフォルダ（`NoteDirs.usersOf`。予約より前に `_common` になったものなど）と同じときも使えない状態。

## 落とし穴
- プロジェクトの `note_dir` を親フォルダそのものにすると、`_common` がそのプロジェクトの木にも出る（直していない）。
- テストは機能を始めないので、共通のノートが要るテストは `notes.syncCommon()` を呼ぶ。
- テスト: `routes.common.test.ts`・`noteDirChanges.test.ts`・`routes.transfer.test.ts`・`tools.test.ts`・`turnParts.test.ts`。
