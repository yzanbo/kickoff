# プロジェクト（`features/projects`）

プロジェクトの印・色・タグ・並び・メニュー、プロジェクトの画面（`ui/page/`）、編集のダイアログ（`ui/settings/`。節は settings の `settingsSections`）、新しいプロジェクト（`ui/new/`）、右サイドバー（`ui/rightSidebar/`）。サイドバーの見出しは `src/features/sidebar/CLAUDE.md`、ボードは `src/features/board/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `PRJ-`。

## 地図
- `core/service.ts`（HTTP を知らない手順）・`core/routes.ts`（取り決め `@shared/projects/contract.ts`）・上の機能の口 `ProjectsApi`
- `ui/page/`（プロジェクトの画面・`tabOrder.ts`）・`ui/projectViews.ts`（拡張点 `projectViews`・`ProjectViewHost`）・`ui/settings/`・`ui/new/`・`ui/rightSidebar/`
- `ProjectMark`・`useVisibleProjects`・`projectOrder.ts`・`tagActions.ts`・`folderOverlaps.ts`

## 決まり

- プロジェクトの色を出すのは印 `ProjectMark` だけ。札の地と枠の色は `ProjectMark.css`（サイドバーの見出しは `ProjectList.css`）。色は店の `Project.hue`（部品は `useProjectHue(id)`）。
- 見せるプロジェクトは `useVisibleProjects`（サイドバー・全プロジェクトの画面・⌘⇧A で共通）。並びは `projectOrder.ts`。
- アーカイブする・戻すは必ず確かめる（`confirmArchiveProject` / `confirmRestoreProject`）。
- 操作は右クリックの `useProjectMenu` に入れる。すべてのプロジェクトに効く設定はサイドバーの見出しに置く。
- タグの整え方は `@shared/projects/tags.ts`、名前の変更・削除は `tagActions.ts`（付いているすべてのプロジェクトに効く）。
- フォルダの被りは、どこでも `folderOverlaps.ts`（ノートは `NoteOverlapNotice`）の判定と文で知らせる。
- 部品からは `openNewProject(request)` で開く（作ったあとの処理は値で渡す）。プロジェクトがなければ先に `NoProjectsGuide`。
- 上の機能の力は `ProjectsApi` に口を足して登録してもらう（作業中か・ゴミ箱は chat、フォルダを変えたあとは workplaceMove、設定を変えたあとは github）。GitHub の連携のルートは github、Git の様子は口 `projectGit`、チャット・グループは口 `projectChats`・`projectGroups`、作ったあとの処理は `newProjectAfters`（値の形は `NewProjectAfterMap` に持ち主が足す）。

## 落とし穴

- タグの絞り込み（`useProjectTagFilter`）は、サイドバーの並び・ショートカット・要対応の数・全プロジェクトの画面・⌘⇧A に効く。変えたらこれらも見る。
- もうないプロジェクト（`useProjects().missing`）の画面は中身の部品を出さない（グループ・Git の状態を読まない）。
- プロジェクトの画面（真ん中のタブ・右サイドバー・チャットの右の欄）は拡張点 `projectViews`（`ui/projectViews.ts`）に持ち主が登録し、どこも `ProjectViewHost` で描く（置き場所の違いは中身が `place` で決める。右の欄のタブは `chatSideView.ts`、「＋ ▾」は chatPanel の `chatSideAdds`）。枠は道具の画面（線で囲む）かページか。並べ替えは `ui/page/tabOrder.ts`。書きかけの確かめは `viewLeave.ts`。
- 名前の行の「寄せたときだけ表示」はドラッグ領域にしない（理由は `ProjectHeader.css`）。
- テスト: `core/routes.projects.test.ts`・`core/*.test.ts`・`ui/**/*.test.ts`。
