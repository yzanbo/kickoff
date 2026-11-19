# ファイル・検索・変更と履歴（`features/editor`・`features/history`）
<!-- 行き先: src/features/files/ -->

プロジェクトの画面の「ファイル」「検索」「変更」「履歴」タブと、チャットの右の欄のファイル・変更。見る作業場所は `WorktreePicker`（`features/worktree/CLAUDE.md`）、操作先は `useGitTarget`（API は `?worktree=`）。

| ファイル | 中身 |
|---|---|
| `EditorTab` | 3 つのタブの殻（同じ部品のまま切り替え、開いたタブ・検索・操作の様子を共有） |
| `FilesPane`・`FileTree`・`useFileActions` | ファイルの木・右クリック・名前の変更・作る・ゴミ箱 |
| `useFileTabs`・`fileTabs.ts`・`ProjectFileTab` | 右のファイルのタブ（`Panel` の `SURFACES.files`） |
| `FileView`・`CodeEditor`・`monacoEditor.ts` | 中身（Monaco）・差分を見ながら編集・プレビュー |
| `useProjectSearch`・`useSearchReplace` | 検索と置換 |
| `ChangesPane`・`useCommitActions`・`useGitStatus`・`gitAutoFetch.ts` | 変更・コミット・Git の状態・自動のフェッチ |
| `DiffView`・`quickDiff.ts`・`useGitBlame` | 差分・行の横の帯・行の変更の記録 |
| `SideChanges`・`SideFileView` | チャットの右の欄の変更とファイル |
| `history/` | 履歴（帯・表・線 `commitGraph.ts`・ブランチの操作 `useBranchActions`） |

## ファイルとタブ
<!-- 行き先: src/features/files/ -->

- 開き方は `openFileTab` 1 つ。タブのキーは `fileTabKeyOf`（差分はステージ済み・未ステージごとに 1 つ）。
- 保存していない変更は、閉じる・入れ替える・名前の変更・置換の前に聞く（`confirmCloseUnsaved`・`dirtyUnder`）。
- 名前を変えたら開いているタブを `relocate`、ゴミ箱に入れたら `forget`。
- 新しいファイルは名前を書いてから作る（作業場所に仮の名前のファイルを残さない）。空のフォルダはコアの `empty_dirs` から出す。
- 保存は開いたときの指紋（`hash`）と比べる。保存した直後の古い中身はほかでの変更と見ない（`ignoreHash`）。
- ピントは差分の「編集」・新しいファイルから来たときだけ置く（チャット欄・一覧のピントを奪わない）。
- Monaco は作り直さず `updateOptions` で変える。上げたときは `monacoEditor.ts` の頭のとおり入口を作り直す。
- Monaco の選択はページの選択にならないので、チャットに足す選択は `registerCodeSelection` から読む。
- ⌘F はエディタがあれば `MonacoFindBar`（Monaco の検索を使う）、ほかは `ui/FindBar`。探し方はほかの欄とそろえる。
- 木の縦の線はファイル・変更・履歴・メモの木で同じ CSS（`editor-explorer.css`）。

## 検索と置換
<!-- 行き先: src/features/files/ -->

- 印と置き換えはコアと同じ `@shared/search/searchMatch`。置換は結果の行だけをコアが置き換える（探したあとで変わった行はしない）。

## 変更・差分・Git の操作
<!-- 行き先: src/features/git/ -->

- リモートとやり取りする操作は `runGitOperation` を通す（自動のフェッチとぶつかると「cannot lock ref」で落ちる）。
- 右の欄の Git の状態は、知らせが続いても最初の知らせから 1.5 秒で取り直す（届くたびに待ち直さない）。
- 差分の表の行のクラスは `line-add` など（タイムラインの `.diff-add` とは別）。`DIFF_LAYOUT` は差分のどこでも共通。
- Git の外・未追跡には行の横の帯・変更の記録を出さない。記録は保存した中身で取るので、未保存の間は出さない。
- 確認済みの印は差分の指紋（`diffFingerprint`）で覚え、差分が変わったら外す。

## 履歴（`features/history/`）
<!-- 行き先: src/features/git/ -->

- ファイルが入れ替わる操作は、作業中のチャット・コミットしていない変更があれば注意を添えて確かめる。マージ・リベースは先に見込みを出す。
- 衝突したら「変更タブで解決する」か「取りやめる」を利用者が選ぶ（途中の操作の帯は `OperationBanner`）。
- 操作の窓（`GitCommandPalette`）は閉じてから実行する（確かめのダイアログを重ねない）。
- 作者の印に外の画像を取りに行かない。対話式のリベースは置かない。
- 終わったら Git の状態（応答の状態は `applyStatus`）と履歴を取り直す。
