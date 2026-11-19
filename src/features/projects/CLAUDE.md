# プロジェクト（`src/features/projects`）

プロジェクトの印・色・タグ・並び・メニュー、プロジェクトの画面（`ui/page/`）、編集のダイアログ（`ui/settings/`）、新しいプロジェクト（`ui/new/`）、右サイドバー（`ui/rightSidebar/`）。サイドバーの見出しは `src/features/sidebar/CLAUDE.md`、ボードは `src/features/board/CLAUDE.md`。

## 決まり

- プロジェクトの色を出すのは印 `ProjectMark` だけ。名前の札の地と枠の色は `project-mark.css` に 1 か所（部品の CSS に書かない）。色は `projectHue(id)` で読む。
- 見せるプロジェクトは `useVisibleProjects`（サイドバー・全プロジェクトの画面・⌘⇧A・パネルのタブで共通）。並びは `projectOrder.ts`。
- アーカイブする・戻すは必ず確かめる（`confirmArchiveProject` / `confirmRestoreProject`）。
- 操作は右クリックの `useProjectMenu` に入れる。すべてのプロジェクトに効く設定はサイドバーの見出しに置く。
- タグの整え方は `@shared/projects/tags.ts`、名前の変更・削除は `tagActions.ts`（付いているすべてのプロジェクトに効く）。
- フォルダの被りは、どこでも `folderOverlaps.ts`（ノートは `NoteOverlapNotice`）の判定と文で知らせる。
- 部品からは `openNewProject(request)` で開く（作ったあとの処理は値で渡す。理由は `NewProjectAfter`）。プロジェクトがなければ先に `NoProjectsGuide`。
- コアのプロジェクトのルートが上の機能の力を使うときは、`core/index.ts` の `ProjectsApi` に口を足して上の機能が登録する（作業中か・フォルダを変えたあと・ゴミ箱に入れたチャットは chat、設定を変えたあと・GitHub の連携は github）。

## 落とし穴

- タグの絞り込み（`useProjectTagFilter`）は、サイドバーの並び・ショートカット・要対応の数・全プロジェクトの画面・⌘⇧A に効く。変えたらこれらも見る。
- もうないプロジェクト（`useProjects().missing`）の画面は中身の部品を出さない（グループ・Git の状態を読みに行かない）。
- タブを足すときは、道具の画面（線で囲む）かページの画面（囲まない）かで枠を決める。並べ替えの決まりは `ui/page/tabOrder.ts`。
- 名前の行の「寄せたときだけ表示」はドラッグ領域にしない（理由は `project-page.css`）。
