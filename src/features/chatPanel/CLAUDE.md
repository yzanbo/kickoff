# チャットのパネル（`src/features/chatPanel`）

## タブの種類（`ui/chatTabKinds.ts`）

- チャット・新しいチャット・サブエージェント・子チャット・新しい子チャットの 5 種類。中身 `chatTabPages.tsx`・見た目 `chatTabFaces.tsx`（状態の印 `useTabAgentState`・動きの印・作業場所の札）・右クリック `chatTabMenus.tsx`（サイドバーの行と同じ `ChatMenuItems` / `DraftMenuItems`）。
- タブに出す項目（`tabFields.ts`）は隠したものだけを覚える。まとまりの札に出る項目はタブに出さない（`groupedTabField`）。
- 新しいチャットのタブは送ると同じ位置で `replaceWithChat`、右の欄の中身は `moveDraftSidePanel` で移す。

## サイドバーとの連動（`ui/state/linkedTabs.ts`）

- チャットのタブは、サイドバーに出ているチャット（`useLinkedChats`）に、一覧が届いてから `syncLinkedTabs` でそろえる。
- 足すのは一覧のペイン（`PaneLayout.home`）だけ（理由は `linkedChatsExt` の `sync` のコメント）。
- 表示だけ消したタブは `dismissed` に覚えて出し直さず、一覧にないのに開いたチャットは `extra` で残す。アーカイブ・削除のあとは覚えない。
- 一覧のペインのタブはサイドバーと同じ並び（`orderLikeSidebar`）で、落とすと手動の並びを変える。アーカイブ済みはタブの列だけの設定 `chatPanel:show-archived`。

## タブのまとまり（`ui/clusters/`）

- まとめ方は欄ごとに覚え（`useTabGrouping(surface)`）、チャットのタブにだけ効く。
- 入るまとまりは `useTabClusters` で、サイドバー・ボードと同じ `bucketChats` の決め方・キー・色にする。並びは `clusterTabs`（`sortBuckets` と同じ順）。
- 札を出すのは一覧のペインだけ（`useTabStrip` の `home`）。畳んだまとまりは表示中のタブだけを残す（`visibleClusterTabs`）。
- 札の並べ替え `useClusterReorder` とタブをグループへ落とす `useClusterTabDrop` は同じ枠で受けるので、`joinDropHandlers` でつなぐ。
- 札の右クリックの項目は「表示」のメニューと同じ部品（`HiddenGroupItems`・`BucketColorItem`・`ClusterShortItem`・`ArchivedChatsItem`）。

## 下書き（送る前の新しいチャット）

- 下書き（`ui/drafts/panelDrafts.ts`）を変える操作（`setDraftGroup`・`setDraftTitle` など）は、欄が画面になくても覚えている内容を書き換える。名前の出し方は `draftDisplayTitle` 1 つ。
- 再起動しても残すのは下書きのタブだけ（`draftPersistence.ts`）。書きかけは入力欄に 1 回だけ戻し、外した添付は戻さない。
