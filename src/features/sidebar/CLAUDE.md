# 左のサイドバー（`src/features/sidebar`）

上に新しいチャット・全プロジェクト・検索、その下にプロジェクトごとのチャットの一覧、左下に設定（パスは `ui/` から）。まとめ方・並び順・行の操作・数え方・開閉は `src/features/chatList/CLAUDE.md`、グループの共通部分は `src/features/groups/CLAUDE.md`、プロジェクトの印・メニュー・タグは `src/features/projects/CLAUDE.md`。

| ファイル | 中身 |
|---|---|
| `Sidebar`・`useSidebar` | 殻・開閉と幅 |
| `useProjectNav`・`ProjectNav` | プロジェクトの並び・切り替え（いま選んでいるものは `@/features/projects/ui/currentProject.ts`） |
| `ProjectListHead`・`SidebarViewTuner`・`viewFields.ts` | 一覧の上の見出し（ビュー・⚙ の窓・タグ）・ビューの項目の表 |
| `ProjectList` | プロジェクトの一覧（縦並び / スライド） |
| `inboxOrder.ts`・`WaitingInbox` | 要対応 |
| `WorkspacePage`・`WorkspaceHead`・`useWorkspaceRows` | 1 プロジェクトのページと見出し・上から並ぶまとまり |
| `sidebarHeads.tsx`・`useWorkspaceDrops.ts`・`useChatRowRenderer.tsx` | まとまりの見出しの表（木は chatList の `BucketTree`）・落とし先・行の配線（メニュー・名前の変更） |
| `ChatRow`・`ChildChatRows`・`DraftRows` | 行・子チャットの行・下書きの行 |

## 見出しとビュー（`ProjectListHead`）

- すべてのプロジェクトに効く設定はこの見出しに置く（プロジェクトのメニューに入れない）。⚙ の窓のボタン 1 つに設定は 1 種類。
- ビューは値の組を覚えるだけで、当てるときに各設定へ書く（`useSidebarViews` の `apply`）。項目は `viewFields.ts` の表の 1 行（型・比べ方・⚙ の窓・設定の画面・説明はそこから作る）。タブはボードと共通の chatList の `NamedViewTabs`。
- 要対応の数は子チャット（孫も）も数える（`useChatsWithChildren`）。出し方と並べ方は別のキー（プロジェクト内の上にするときは並べ方をプロジェクト別に戻す）。
- 言い方: 「〜順」は並べる順、「〜別」は見出しに分ける。

## プロジェクトの並びと見出し（`useProjectNav`・`WorkspaceHead`）

- 並べ替えは `kit/drag` の `useReorder`（カード・丸・全プロジェクトのボード）。落とすと手動の並びに切り替える。
- 押し方はサイドバー全体で同じ: 名前より左（`pressedLeftOfName`）は開閉だけ、ほかは選び直して開く。
- 乗せたときだけ出す操作は作らない。操作はまず右クリックの `useProjectMenu` に足す。
- ショートカットは、チャットが先に受けたら見ない（`defaultPrevented`）。

## 下書きの行（`DraftRows`）

- 下書きは `useProjectDrafts` から読む。本文は表示だけに使い、名前として保存しない。
- 手動の並びでは、タブの列の位置に合わせてチャットの行の間に置く（`draftAnchor`）。固定した下書きは間に置かない。
