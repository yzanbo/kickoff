# ボード（`features/board`）

チャットのカンバン（プロジェクトのボード `KanbanBoard` と全プロジェクトのボード `AllProjectsKanban`。中身は共通の `KanbanView`）。まとまりは `bucketChats`（`src/features/chatList/CLAUDE.md`）、受け入れの一覧: `docs/features.md` の `LST-`。

## 地図
- `ui/BoardShell`・`BoardHeader`（ツールバー。画面の文言では「見出し」と呼ばない）・`KanbanBoard`・`KanbanBody`・`KanbanView`
- `ui/StateColumn`・`BoardLanes`・`FlatTasks`・`ProjectGroupColumns`・`useBoardCards`・`ChatCard`
- `ui/layout.ts`（見え方 `BoardViewState`・`boardLayout`）・`BoardContext`（`useBoard`）・`savedViews.ts`・`initialViews.ts`
- `ui/useFeed`・`feed.ts`・`FeedList`・`useKanbanFilters`・`archiveFilter.ts`・`chatSort.ts`・`cardFields.ts`

## 決まり

- 状態の列は AI の状態から `boardColumnOf` で決め、人は動かさない。
- グループの列・段へ落とすのは `useGroupDropTargets`（アーカイブ済みは確かめて戻してから入れる）。
- 開く先は `BoardChats` だけを見る（置き方で分岐しない）。全プロジェクトのボードはチャットを開かず、そのプロジェクトへ移って開く（右のパネルを持たない）。
- ボードごとの違いは `useBoardCards` の `classFor` などだけで渡す（カードを描く所を増やさない）。
- 見え方は 1 つの設定 `BoardViewState`。全プロジェクトとプロジェクトのボードで別のキー（`layoutAll`・`layoutProject`）。部品は `useBoard()` から読み、`allProjects` を props で渡さない。列・段の決まりは純粋な `boardLayout` に足す。
- ビューは見え方の組を覚えるだけで、当てるときに各設定へ書く（`apply`）。名前の検索・作業場所の絞り込みは入れない。タブはサイドバーと共通の chatList の `NamedViewTabs`、一覧の操作は `@/foundation/ui/lib/namedViews.ts`。
- 初めのビューは `ui/initialViews.ts` の `DEFAULT_PROJECT_VIEWS` など。すべて消したら `[]` を覚えて戻さない。
- 狭いときは `@container` と `useWrapCompact` で詰める（決め打ちの幅で切り替えない）。

## 落とし穴

- アーカイブの絞り込み（見え方の `archive`）はサイドバーの `chatList:show-archived` と連動させない（つなぐと両方のビューが同じ設定を取り合い、どちらも「変えている」になる）。
- 全プロジェクトのボードの開閉の場所は `board:kanban:all` のまま（覚えた開閉を消さない）。
- 複数選択はボードごとに `useChatSelectionState`（範囲は `boardCardIds`。サイドバーの選択とは別）。
- アーカイブ済みは下に畳む部品 `ArchivedFold`。カードはどこも `ProgressiveItems` で描く。範囲の選択・ドラッグでは、先に `ensureAllRows` で残りを描く。⌘F は名前の検索欄（データで絞るので描いていないカードも探せる）。
- フィードは届いた返答を 1 フレームの分まとめて `upsertFeedItems` で当てる（1 件ごとに描き直さない）。
- グループの並びは DB（`api.reorderGroups`）、「No Group」の位置は画面に覚える（`groups:ungrouped-at`。サイドバーと共通。並べ方は `@/features/groups/ui/groupOrder.ts`）。
- 段・グループの数は下書きも 1 つと数える（サイドバーと同じ）。
