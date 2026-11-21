# ファイル（`src/features/files`）

プロジェクトの画面の「ファイル」「検索」タブと、チャットの右の欄のファイル・返答のファイルのチップ。変更・履歴は `src/features/git/CLAUDE.md`。見る作業場所は `WorktreePicker`、操作先は `useGitTarget`（どちらも `@/foundation/ui/workplace/`。API は `?worktree=`）。

## 地図

| ファイル | 中身 |
|---|---|
| `core/files.ts`・`core/search.ts` | ファイルの読み書き・検索と置換（コア） |
| `core/tools.ts` | AI の `open_file`（作業場所の中だけ） |
| `ui/EditorTab` | タブの殻（同じ部品のまま切り替え、開いたタブ・検索・操作の様子を共有） |
| `ui/FilesPane`・`FileTree`・`useFileActions` | ファイルの木・右クリック・名前の変更・作る・ゴミ箱 |
| `ui/useFileTabs`・`fileTabs.ts`・`ProjectFileTab` | 右のファイルのタブ（`Panel` の `SURFACES.files`） |
| `ui/FileView`・`CodeEditor`・`monacoEditor.ts` | 中身（Monaco）・差分を見ながら編集・プレビュー |
| `ui/useProjectSearch`・`useSearchReplace` | 検索と置換 |
| `ui/SideFileView` | チャットの右の欄のファイル |
| `ui/links/` | 返答のファイルのチップ（`FileLinksProvider`・`FileMenu`・`fileIndexStore.ts`） |

## 決まり

- 開き方は `openFileTab` 1 つ。タブのキーは `fileTabKeyOf`（差分はステージ済み・未ステージごとに 1 つ）。
- 保存していない変更は、閉じる・入れ替える・名前の変更・置換の前に聞く（`confirmCloseUnsaved`・`dirtyUnder`）。
- 名前を変えたら開いているタブを `relocate`、ゴミ箱に入れたら `forget`。
- 新しいファイルは名前を書いてから作る（作業場所に仮の名前のファイルを残さない）。空のフォルダはコアの `empty_dirs` から出す。
- ピントは差分の「編集」・新しいファイルから来たときだけ置く（チャット欄・一覧のピントを奪わない）。
- ⌘F はエディタがあれば `MonacoFindBar`（Monaco の検索を使う）、ほかは `@/foundation/ui/kit/FindBar.tsx`。探し方はほかの欄とそろえる。
- 印と置き換えはコアと同じ `@shared/foundation/search/searchMatch`。置換は結果の行だけをコアが置き換える（探したあとで変わった行はしない）。
- チップにするのはチャットのパネルの中（`FileLinksProvider`）だけ。開き方は `open` 1 つで、チップ・変更カード・ツールの行で共有する。`FileMenu` は 1 つだけ描く。

## 落とし穴

- 保存は開いたときの指紋（`hash`）と比べる。保存した直後の古い中身はほかでの変更と見ない（`ignoreHash`）。
- Monaco は作り直さず `updateOptions` で変える。上げたときは `monacoEditor.ts` の頭のとおり入口を作り直す。
- Monaco の選択はページの選択にならないので、チャットに足す選択は `registerCodeSelection`（`@/foundation/ui/code/codeSelection.ts`）から読む。
- 木の縦の線はファイル・変更・履歴・ノートの木で同じ CSS（`editor-explorer.css`）。
- チップの開く関数は同じものにして返答の Markdown を描き直させない。remark の差し込みは一覧を受け取らずにパスらしい文字に印を付け、開けるかはリンクの部品が `fileIndexStore.ts` から自分の分だけ読む（一覧を取り直しても解析し直さない）。
