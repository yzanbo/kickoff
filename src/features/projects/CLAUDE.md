# プロジェクト（`features/projects`）

プロジェクトの印・色・タグ・並び・メニュー、プロジェクトの画面（`ui/page/`）、編集のダイアログ（`ui/settings/`。節は settings の `settingsSections`）、新しいプロジェクト（`ui/new/`）、右サイドバー（`ui/rightSidebar/`）。サイドバーの見出しは `src/features/sidebar/CLAUDE.md`、ボードは `src/features/board/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `PRJ-`。

## 地図
- `core/service.ts`（HTTP を知らない手順）・`core/routes.ts`（取り決め `@shared/projects/contract.ts`）・上の機能の口 `ProjectsApi`
- `ui/page/`（プロジェクトの画面・`tabOrder.ts`）・`ui/projectViews.ts`（拡張点 `projectViews`・`ProjectViewHost`）・`ui/settings/`・`ui/new/`・`ui/rightSidebar/`
- `ProjectMark`・`useVisibleProjects`・`projectOrder.ts`・作成先 `projectTargets.ts`・`tagActions.ts`・`folderOverlaps.ts`

## 決まり
- プロジェクトの色を出すのは印 `ProjectMark` だけ。札の地と枠の色は `ProjectMark.css`（サイドバーの見出しは `ProjectList.css`）。色は店の `Project.hue`（部品は `useProjectHue(id)`）。共通は灰色 `COMMON_TONE`。
- 見せるプロジェクトは `useVisibleProjects`（サイドバー・全プロジェクトの画面・⌘⇧A）。並びは `@shared/projects/order.ts`（スマホも。共通は先頭・絞っても残す・`reorderableIds` の外）。
- 共通（`kind` あり）は API・店に残す。判定と呼び名は `@shared/projects/kinds`（操作の所は `isUserProject`、Git の作業場所は `hasGitWorkplace`、画面は `useIsCommonProject`）。HTTP の口は `requireUserProject` で 409（PATCH は共通でも `COMMON_PATCH_KEYS` を通す）、店の `update` は断らない。持ち主がフォルダを変えるときは `ProjectsApi.changeOwnedFolder`（作業中なら 409、チャットは `afterRepoMove` で移す）。
- アーカイブする・戻すは必ず確かめる（`confirmArchiveProject` / `confirmRestoreProject`）。
- 操作は右クリックの `useProjectMenu` に入れる（共通は `CommonMenu`）。すべてのプロジェクトに効く設定はサイドバーの見出しに置く。
- タグの整え方は `@shared/projects/tags.ts`、名前の変更・削除は `tagActions.ts`。
- フォルダの被りは `folderOverlaps.ts`（ノートは `NoteOverlapNotice`）の判定と文で知らせる。
- `openNewProject(request)` で開く（作ったあとの処理は値で渡す）。プロジェクトがなければ先に `NoProjectsGuide`。
- 上の機能の力は `ProjectsApi` の口に登録してもらう（作業中か・ゴミ箱は chat、フォルダの変更後は workplaceMove、設定の変更後は github）。口: Git の様子 `projectGit`・チャットとグループ `projectChats`・`projectGroups`・作ったあと `newProjectAfters`（形は `NewProjectAfterMap`）。GitHub のルートは github。

## 落とし穴
- タグの絞り込み（`useProjectTagFilter`）はサイドバーの並び・ショートカット・要対応の数・全プロジェクトの画面・⌘⇧A に効く。
- もうないプロジェクト（`missing`）は中身を出さない。
- プロジェクトの画面（真ん中のタブ・右サイドバー・チャットの右の欄）は拡張点 `projectViews`（`ui/projectViews.ts`）に持ち主が登録し、どこも `ProjectViewHost` で描く（違いは中身が `place` で。右の欄のタブは `chatSideView.ts`、「＋ ▾」は chatPanel の `chatSideAdds`）。出すかはどこも `canShowProjectView`（共通は `common` を付けた画面だけ。設定の節は `projectSettingsSections`）。並べ替えは `ui/page/tabOrder.ts`（共通は全体に戻して覚える）。書きかけは `viewLeave.ts`。
- 名前の行の「寄せたときだけ表示」はドラッグ領域にしない。
- テスト: `core/*.test.ts`（API は `routes.projects`）・`ui/**/*.test.ts`。
