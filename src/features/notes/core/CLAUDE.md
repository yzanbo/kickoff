# ノートのコア（共通のノート）

共通のノート = どのプロジェクトにも属さないノート。Kickoff が用意するプロジェクト「共通」（`kind: "common"`。共通のチャットと共通のノートの持ち主）のノートとして、ノートの API・チャット・見張り・検索・ゴミ箱をそのまま使う。

## 地図
- `commonNotes.ts`: 共通を用意する・付け替える `sync`・使えない理由 `unavailable`・設定の変更に挟む `settingsHook`
- `turnParts.ts`（書ける場所とシステムプロンプト）・`tools.ts`（`open_note`・`move_note` の `scope`・`get_project_note_dir`）
- `noteTransfer.ts`: 欄の間（共通のノートとプロジェクト・プロジェクトどうし）で動かす `createNoteTransfer`（`POST …/notes/move` の `to_project_id`・`move_note`）

## 決まり
- 本体（`repo_path`）は作業フォルダ = 親フォルダの下の `.common-work`（設定で変えない）、`note_dir` は設定 `common_notes_dir`（なければ親フォルダの下の `_common`）。実体のパスで、コアが mkdir する。チャットは作業フォルダで動く。前の版のデータ（本体 = `_common`）は `sync` が付け替える。
- 合わせるのは起動したとき（`start`）と、設定の PUT のあと（settings の `onUpdate`）。付け替えは projects の `changeOwnedFolder`（本体が変わればチャットに区切りを置く）。作業中のチャットがあれば設定の変更を 409。
- 2 つのフォルダのどちらかが利用者のプロジェクト（ゴミ箱のものも）の本体・ノートのフォルダと同じなら、使えない状態（理由は `GET /api/notes/defaults` の `common_unavailable`）。`common_notes_dir` で利用者のプロジェクト・作業フォルダ（の中）を選べば保存前に 409。
- `projectNoteFolder` は `_common`・`.common-work` をいつも使用中に数える（`_common-2`）。
- 共通のノートのフォルダは、ほかのチャットの書ける場所に足して分けて伝える（自身では二重にしない・使えなければ足さない）。共通のチャットには頼まれたときだけ読み書きさせ、利用者のプロジェクトのノートのフォルダを読むだけで足す。
- ツールの `scope` は `project`（省いたとき）・`common`。共通のノートのフォルダの中の絶対パスは scope によらず共通。`move_note` は from と to の欄が違えば欄の間で動かす。
- 欄の間で動かすときは、ノートのチャット（フォルダなら中のノートのもの。アーカイブ済みも）と子孫も workplaceMove の `move`（`project_moved`）で行き先へ移し、`note_path` を付け替える。ファイルは `folderFiles` の `moveTo`。
- どれかが作業中ならファイルを動かす前に 409、チャットを移せなければファイルとチャットを元に戻す。行き先がない（ゴミ箱）は 404、アーカイブ・使えない共通のノートは 409。DB の接続の手順ノートは元のプロジェクトの接続なので付いていかない（`onMoved` を出さない）。
- ノートのフォルダの場所が変わったら `notes`（path は null）を出す（`noteDirChanges.ts`。決めていないフォルダは数えない）。開いている文書は外で変えられたときと同じく読み直す。
- 共通のワークツリーは断る（HTTP は 409、AI の `create_chat` の `worktree_branch` も。親フォルダが Git の中でも）。

## 落とし穴
- プロジェクトの `note_dir` を親フォルダそのものにすると、`_common` がそのプロジェクトの木にも出る（直していない）。
- テストは機能を始めないので、共通のノートが要るテストは `notes.syncCommon()` を呼ぶ。
- テスト: `routes.common.test.ts`・`noteDirChanges.test.ts`・`routes.transfer.test.ts`・`tools.test.ts`・`turnParts.test.ts`。
