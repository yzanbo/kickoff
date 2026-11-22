# ボード（`src/features/board`）

チャットのカンバン（プロジェクトのボード `KanbanBoard` と全プロジェクトのボード `AllProjectsKanban`。中身は共通の `KanbanView`）。まとまりは `bucketChats`（`src/features/chatList/CLAUDE.md`）、右のパネルは `src/features/panel/CLAUDE.md`（パスは `ui/` から）。

| ファイル | 中身 |
|---|---|
| `BoardShell`・`BoardHeader` | 外枠・ツールバー（画面の文言では「見出し」と呼ばない） |
| `KanbanBoard`・`KanbanBody` | 状態と操作・表示 × 段 × 列の分け方の描き分け |
| `StateColumn`・`BoardLanes`・`FlatTasks`・`ProjectGroupColumns` | 状態の列・段・分けない並び・グループの列 |
| `useBoardCards`・`ChatCard` | カード・リストの行・フィードのカード（中身は `ChatCardContent` の layout。操作は chatList の `chatItemProps`） |
| `layout.ts`・`BoardContext` | 見え方（ボードの種類ごとに 1 つ）・列と段の決まり `boardLayout`・根の context（`useBoard`） |
| `savedViews.ts`・`useSavedViews` | 保存したビュー |
| `useFeed`・`feed.ts`・`FeedList` | フィード（全プロジェクトのボードだけ） |
| `useKanbanFilters`・`archiveFilter.ts`・`chatSort.ts`・`cardFields.ts` | 絞り込み・並び順・表示項目 |

## 決まり

- 状態の列は AI の状態から `boardColumnOf` で決め、人は動かさない。
- 開く先は `BoardChats` だけを見る（置き方で分岐しない）。全プロジェクトのボードはチャットを開かず、そのプロジェクトへ移って開く（右のパネルを持たない）。
- ボードごとの違いは `useBoardCards` の `classFor` などだけで渡す（カードを描く所を増やさない）。
- 見え方は全プロジェクトとプロジェクトのボードで別のキー（`layoutAll`・`layoutProject`）。部品は `useBoard()` から読み、`allProjects` を props で渡さない。列・段の決まりは純粋な `boardLayout` に足す。
- ビューは見え方の組を覚えるだけで、当てるときに各設定へ書く（`apply`）。名前の検索・作業場所の絞り込みは入れない。タブはサイドバーと共通の chatList の `NamedViewTabs`、一覧の操作は `@/foundation/ui/lib/namedViews.ts`。
- 初めのビューは `ui/initialViews.ts` の `DEFAULT_PROJECT_VIEWS` など。すべて消したら `[]` を覚えて戻さない。
- 狭いときは `@container` と `useWrapCompact` で詰める（決め打ちの幅で切り替えない）。

## 落とし穴

- アーカイブの絞り込み（見え方の `archive`）はサイドバーの `chatList:show-archived` と連動させない（つなぐと両方のビューが同じ設定を取り合い、どちらも「変えている」になる）。
- 全プロジェクトのボードの開閉の場所は `board:kanban:all` のまま（覚えた開閉を消さない）。
- 複数選択はボードごとに `useChatSelectionState`（範囲は `boardCardIds`。サイドバーの選択とは別）。
- カードはどこも `ProgressiveItems` で描く。範囲の選択・ドラッグでは、先に `ensureAllRows` で残りを描く。⌘F は名前の検索欄（データで絞るので描いていないカードも探せる）。
- フィードは届いた返答を 1 フレームの分まとめて `upsertFeedItems` で当てる（1 件ごとに描き直さない）。
- グループの並びは DB（`api.reorderGroups`）、「No Group」の位置は画面に覚える（`groups:ungrouped-at`。サイドバーと共通。並べ方は `@/features/groups/ui/groupOrder.ts`）。
- 段・グループの数は下書きも 1 つと数える（サイドバーと同じ）。
