# ファイル（`src/features/files`）

プロジェクトの画面の「ファイル」「検索」タブと、チャットの右の欄のファイル・返答のファイルのチップ。変更・履歴は `src/features/git/CLAUDE.md`。Git の状態・飾り・変更の一覧・差分のタブは口 `ui/filesGit.ts` で受ける（git が登録。files は git を読まない）。見る作業場所は `WorktreePicker`、操作先は `useWorkplace`（どちらも `@/foundation/ui/workplace/`。API は `?worktree=`）。

## 地図

| ファイル | 中身 |
|---|---|
| `core/files.ts`・`core/search.ts`・`core/routes/files.ts` | ファイルの読み書き（土台の `workplaceFiles`。ほかの機能へは `FilesApi`）・検索と置換・受け口（取り決め `@shared/files/contract.ts`。画面の呼び手は `ui/api.ts`、作業場所は `workdirInput`） |
| `core/tools.ts` | AI の `open_file`（作業場所の中だけ） |
| `ui/EditorTab` | タブの殻（同じ部品のまま切り替え、開いたタブ・検索・操作の様子を共有） |
| `ui/FilesPane`・`FileTree`・`useFileOps`・`fileMenuItems`・`FileTreeMenu` | ファイルの木・名前の変更・作る・ゴミ箱・右クリック（外のアプリとパスのコピーは土台の `PathMenuItems`） |
| `ui/useFileTabs`・`fileTabs.ts`・`ProjectFileTab` | 右のファイルのタブ（`Panel` の欄 `files`） |
| `ui/FileView`・`useFileDocument`・`FileHeader`・`usePreviewMode`・`CodeEditor`・`monacoEditor.ts` | 中身（文書の土台 `useDocument` の上。Monaco の付け足しは `codeEditorParts.ts` の `attach…`）・差分を見ながら編集・プレビュー |
| `ui/useProjectSearch`・`useSearchReplace` | 検索と置換 |
| `ui/SideFileView` | チャットの右の欄のファイル |
| `ui/links/` | 返答のファイルのチップ（`FileLinksProvider`・`FileMenu`・引き当ての口 `fileRefs.ts`） |

## 決まり

- 開き方は `openFileTab` 1 つ。タブのキーは `fileTabKeyOf`（差分はステージ済み・未ステージごとに 1 つ）。
- 保存していない変更は、閉じる・入れ替える・名前の変更・置換の前に聞く（種類の `confirmClose`、名前の変更・ゴミ箱・置換は未保存の登録簿の `dirtyUnder` = チャットの右の欄のファイルも数える。種類は `ui/fileTabKinds.ts`）。
- 名前を変えたら開いているタブを `relocate`、ゴミ箱に入れたら `forget`。
- 新しいファイルは名前を書いてから作る（作業場所に仮の名前のファイルを残さない）。空のフォルダはコアの `empty_dirs` から出す。
- ピントは差分の「編集」・新しいファイルから来たときだけ置く（チャット欄・一覧のピントを奪わない）。
- ⌘F はエディタがあれば `MonacoFindBar`（Monaco の検索を使う）、ほかは `@/foundation/ui/kit/FindBar.tsx`。探し方は検索タブもほかの欄とそろえる。
- 印と置き換えはコアと同じ `@shared/foundation/search/searchMatch`。置換は結果の行だけをコアが置き換える（探したあとで変わった行はしない）。
- チップにするのはチャットのパネルの中（`FileLinksProvider`）だけ。開き方は `open` 1 つで、チップ・変更カード・ツールの行で共有する。`FileMenu` は 1 つだけ描く。

## 落とし穴

- 保存・読み直し・未保存の印は `useDocument`（409 とほかでの変更は conflict の帯）。タブの「●」・× の確かめは未保存の登録簿の `tab`（`fileTabPlace`）で引く（モジュールの変数に持たない）。
- Monaco のモデルの住所は部品ごと（`editorModels.ts`。同じ住所を 2 つ作ると画面ごと落ちる）。
- Monaco は作り直さず `updateOptions` で変える。上げたときは `monacoEditor.ts` の頭のとおり入口を作り直す。
- Monaco の選択はページの選択にならないので、チャットに足す選択は `registerCodeSelection`（`@/foundation/ui/code/codeSelection.ts`）から読む。右の欄の行の右クリックは `useCodeQuoteMenu`（attachments の `HandOffItems`）で、出すか（`inSide`）を `FileView` の `inSide` にも渡す（ファイルの画面はチャットの右の欄のときだけ）。
- ファイルの一覧は作業場所ごとの店 `ui/filesStore.ts` 1 つ（木とチップが読む。取り直しは Git の version・チャットの状態）。
- 木は土台の `TreeView`（ピントは木そのもの。縦の線と貼り付けは `ui/types/tree.css`）。ノートの木はまだ入れ子の `.file-tree`（`editor-explorer.css`）。
- チップの開く関数は同じものにして返答の Markdown を描き直させない。remark の差し込みは一覧を受け取らずにパスらしい文字に印を付け、開けるかはリンクの部品が `createFileLookup` から自分の分だけ読む（一覧を取り直しても解析し直さない）。
