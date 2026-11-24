# 左のサイドバー（`features/sidebar`）

上に新しいチャット・全プロジェクト・全ノート（notes の全ノートの画面）・検索、その下にプロジェクトごとのチャットの一覧、左下に設定。まとめ方・並び・行の操作は `src/features/chatList/CLAUDE.md`、プロジェクトの印・メニューは `src/features/projects/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `LST-`。

## 地図
- `ui/Sidebar`・`useSidebar`（殻・開閉と幅）・`useProjectNav`・`ProjectNav`・`ProjectList`
- `ui/ProjectListHead`・`SidebarViewTuner`・`viewFields.ts`（ビューの項目の表）・`inboxOrder.ts`・`WaitingInbox`（要対応）
- `ui/WorkspacePage`・`WorkspaceHead`・`useWorkspaceRows`・`sidebarHeads.tsx`・`useWorkspaceDrops.ts`・`useChatRowRenderer.tsx`
- `ui/ChatRow`・`ChildChatRows`・`DraftRows`

## 決まり
- サイドバーは入れ物にしない（chat・projects・chatList・groups・panel を 1 方向に読む）。
- すべてのプロジェクトに効く設定は一覧の上の見出しに置く（⚙ の窓のボタン 1 つに設定は 1 種類）。ビューの項目は `viewFields.ts` の表 1 つ。ビューは値の組を覚えるだけで、当てるときに各設定へ書く。
- 押し方はサイドバー全体で同じ: 名前より左（`pressedLeftOfName`）は開閉だけ、ほかは選び直して開く。
- 乗せたときだけ出す操作は作らない（まず右クリックの `useProjectMenu` に足す）。並べ替えは `useReorder`、落とすと手動の並びに切り替える。
- 言い方: 「〜順」は並べる順、「〜別」は見出しに分ける。

## 落とし穴
- 要対応の数は子チャット（孫も）も数える（`useChatsWithChildren`）。
- ショートカットは、チャットが先に受けたら見ない（`defaultPrevented`）。
- 下書きの本文は表示だけに使い、名前として保存しない。手動の並びではタブの列の位置に合わせて行の間に置く（固定した下書きは置かない）。
- テスト: `ui/*.test.ts`。
