# ファイル（`features/files`）

プロジェクトの「ファイル」「検索」と、チャットの右の欄のファイル・返答のファイルのチップ。変更・履歴は `src/features/git/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `CODE-`。

## 地図
- `core/files.ts`（読み書き。土台の `workplaceFiles`、ほかの機能へは `FilesApi`）・`core/search.ts`・`core/routes/files.ts`（`@shared/files/contract.ts`・`workdirInput`）・`core/tools.ts`（`open_file`）
- `ui/EditorTab`・`FilesPane`・`FileTree`・`useFileOps`・`fileMenuItems`・`ui/fileTabKinds.ts`・`useFileTabs`・`ProjectFileTab`
- `ui/FileView`・`useFileDocument`・`CodeEditor`・`monacoEditor.ts`（付け足しは `codeEditorParts.ts`）・`editorModels.ts`・`SideFileView`
- `ui/useProjectSearch`・`useSearchReplace`・`ui/filesStore.ts`（作業場所ごとの一覧の店）・`ui/links/`（チップ。chat の口 `chatFileLinks` の実装）・土台の口 `workplaceFilesSources`（下の機能が読む一覧。`ui/contributes.ts`）
- Git の状態・差分のタブは口 `ui/filesGit.ts` で受ける（git が登録。files は git を読まない）

## 決まり
- ファイルの操作は `@/foundation/core/files`。開き方は `openFileTab` 1 つ（キーは `fileTabKeyOf`）。
- 書きかけは種類によらず、閉じる・名前の変更・ゴミ箱・置換の前に数える（`dirtyUnder`。チャットの右の欄のファイルも）。名前を変えたら `relocate`、ゴミ箱なら `forget`。
- 新しいファイルは名前を書いてから作る（仮の名前を残さない）。途中のフォルダのリンクを確かめる（作業場所の外に作らない）。
- ピントは差分の「編集」・新しいファイルから来たときだけ置く（チャット欄・一覧のピントを奪わない）。
- 印と置き換えはコアと同じ `searchMatch`。置換は結果の行だけを置き換える（探したあとで変わった行はしない）。
- チップにするのはチャットの画面の中だけ。開き方は `open` 1 つで、`FileMenu` は 1 つだけ描く。⌘F はエディタなら `MonacoFindBar`、ほかは `kit/FindBar`。

## 落とし穴
- 保存・未保存の印は `useDocument`（409 は conflict の帯）。タブの「●」は未保存の登録簿で引く（モジュールの変数に持たない）。
- Monaco のモデルの住所は部品ごと（同じ住所を 2 つ作ると画面ごと落ちる）。作り直さず `updateOptions`。版を上げたら `monacoEditor.ts` の頭のとおり入口を作り直す。
- Monaco の選択はページの選択にならない: チャットに足す選択は `registerCodeSelection` から読む。
- チップの開く関数は同じものにして Markdown を描き直させない。remark の差し込みは一覧を受け取らず、開けるかはリンクの部品が `createFileLookup` から読む。
- テスト: `core/routes.test.ts`・`ui/**/*.test.ts`。
