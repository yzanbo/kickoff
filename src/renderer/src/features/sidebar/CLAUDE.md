# 左のサイドバー（`features/sidebar`）
<!-- 行き先: src/features/sidebar/ -->

上に新しいチャット・全プロジェクト・検索、その下にプロジェクトごとのチャットの一覧、左下に設定。グループの共通部分（`features/group/`）もここに書く。数え方・開閉は `features/chatList/CLAUDE.md`、プロジェクトの印・メニュー・タグは `features/project/CLAUDE.md`。

| ファイル | 中身 |
|---|---|
| `Sidebar`・`useSidebar` | 殻・開閉と幅 |
| `useProjectNav`・`ProjectNav`・`currentProject.ts` | プロジェクトの並び・切り替え・いま選んでいるもの |
| `ProjectListHead`・`SidebarViewTuner`・`sidebarViews.ts` | 一覧の上の見出し（ビュー・⚙ の窓・タグ） |
| `waitingAxes.ts`・`inboxOrder.ts`・`WaitingInbox` | 要対応 |
| `WorkspacePage`・`WorkspaceHead`・`useWorkspaceRows` | 1 プロジェクトのページと見出し |
| `chatGroupings.ts`・`sidebarChatOrder.ts`・`GroupedChatRows` | まとめ方と並び順 |
| `ChatRow`・`ChatRowList`・`ChildChatRows`・`chatSelection.ts` | 行・子チャットの行・複数選択 |
| `CustomGroupSection`・`UngroupedHead`・`DraftRows` | グループの見出し・下書きの行 |

## 見出しとビュー（`ProjectListHead`）
<!-- 行き先: src/features/sidebar/ -->

- すべてのプロジェクトに効く設定はこの見出しに置く（プロジェクトのメニューに入れない）。⚙ の窓のボタン 1 つに設定は 1 種類。
- ビューは値の組を覚えるだけで、当てるときに各設定へ書く（`useSidebarViews` の `apply`）。一覧の操作はボードと共通の `lib/namedViews.ts`。
- 要対応の数は子チャット（孫も）も数える（`useChatsWithChildren`）。出し方 × 並べ方は 1 つの値で保存し、軸との行き来は `waitingAxes.ts`。
- 言い方: 「〜順」は並べる順、「〜別」は見出しに分ける。

## プロジェクトの並びと見出し（`useProjectNav`・`WorkspaceHead`）
<!-- 行き先: src/features/sidebar/ -->

- 並べ替えは `useProjectReorder` で共通（カード・丸・全プロジェクトのボード）。落とすと手動の並びに切り替える。
- 押し方はサイドバー全体で同じ: 名前より左（`pressedLeftOfName`）は開閉だけ、ほかは選び直して開く。
- 乗せたときだけ出す操作は作らない。操作はまず右クリックの `useProjectMenu` に足す。
- ショートカットは、チャットが先に受けたら見ない（`defaultPrevented`）。

## まとめ方と並び順（`chatGroupings.ts`・`sidebarChatOrder.ts`）
<!-- 行き先: src/features/chatList/ -->

- まとめ方・並び順はすべてのプロジェクトに効く 1 つの設定（`useChatLayout`）。分けるのは `bucketChats`。
- パネルの一覧のペインのタブも `useSidebarChatOrder` で同じ並びにする（変えたら panel の「サイドバーとの連動」も見る）。
- 手動の並びはプロジェクトの中の 1 本（`Chat.position`）。どの並び順でも落とすと見えている並びのまま保存し、手動に切り替える。
- 行の一覧は `ChatRowList` で描く（`ul.chat-rows` に手で `.map` を書かない）。範囲の選択・↑↓・ドラッグは先に `ensureAllRows` で残りを描く。

## 行の操作（`ChatRow`・`chatSelection.ts`）
<!-- 行き先: src/features/chatList/ -->

- 右クリックと「…」はパネルのタブと同じ `ChatMenuItems` / `DraftMenuItems`。固定・アーカイブ・削除のボタンを行に並べない。
- 複数選択はサイドバー全体で 1 つ（範囲は画面の並び `visibleRows`）。ボードも同じ `useChatSelectionState`・`SelectionBar` を使う。
- 作業中のチャット（子孫も）は、ほかのプロジェクトへの移動・アーカイブの落とし先に落とせない（`busyBlockReason`）。
- 落とし先は `startChatDrag` が覚えた ID を `accepts` で見る（dragover ではデータを読めない）。受けないものは `passThrough` で外へ渡す。

## グループの共通部分（`features/group/`）
<!-- 行き先: src/features/groups/ -->

- `useReorder`・`useGroupDrop`・`startChatDrag` / `startDraftDrag` はサイドバー・全プロジェクトのボード・タブのまとまりで共通。
- ドラッグの絵は `startDragGhost` を通し、動かしている物を薄くする state はその `after` で変える。
- 「No Group」の位置は全プロジェクトのボードと同じ設定。分けるのは `splitAtUngrouped`（もとの並びの中の位置で分ける）。

## 下書きの行（`DraftRows`）
<!-- 行き先: src/features/sidebar/ -->

- 下書きは `useProjectDrafts` から読む。本文は表示だけに使い、名前として保存しない。
- 手動の並びでは、タブの列の位置に合わせてチャットの行の間に置く（`draftAnchor`）。固定した下書きは間に置かない。
