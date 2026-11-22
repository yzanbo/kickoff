# チャットのパネル（`src/features/chatPanel`）

## タブの種類（`ui/chatTabKinds.ts`）

- チャット・新しいチャット・サブエージェント・子チャット・新しい子チャット。中身 `chatTabPages.tsx`・見た目 `chatTabFaces.tsx`（状態の印 `useTabAgentState`・動きの印・作業場所の札）・右クリック `chatTabMenus.tsx`（サイドバーの行と同じ `ChatMenuItems` / `DraftMenuItems`）。
- タブに出す項目（`tabFields.ts`）は隠したものだけを覚える。まとまりの札に出る項目はタブに出さない（`groupedTabField`）。
- 新しいチャットのタブは送ると同じ位置で `replaceWithChat`、右の欄の中身は `moveDraftSidePanel` で移す。

## 欄（`ui/chatSurfaces.ts`）

- チャットのパネル `kanban`・右の欄 `agents`・チャットの別ウィンドウ `cwin` の決まり。並べ方は 3 つとも `ChatTabStrip`、新しいタブのボタンと空の案内は `ChatPanelAdds`・`AgentPanelAdds`、「表示」のメニューは `ChatViewMenu`。
- 新しいチャットは `startNewChat`（欄のプロジェクトで。決まらなければ案内）。送ってできたチャットの後は欄の `onChatCreated`（URL にする・メインのウィンドウに知らせる）。
- チャットのパネルの表示中のタブは URL にする（`useShownChatInUrl`）。URL がもうほかのプロジェクトの画面なら書かない（`board/shownTabUrl.ts`。移る途中に元の欄のタブを閉じても、移る先を上書きしない）。

## サイドバーとの連動（`ui/state/linkedTabs.ts`）

- チャットのタブは、サイドバーに出ているチャット（欄の `sync` = `useLinkedTabs`）に、一覧が届いてから欄の ext `linkedChatsExt` でそろえる。札の数と一覧は `usePanelChats`。
- タブはチャットを持たず ID で `useKnownChat` から引く（名前は Face が返す。知らないチャットは行を 1 回取る）。
- 足すのは一覧のペイン（`PaneLayout.home`）だけ（理由は panel の reducer の `"sync"`）。
- 表示だけ消したタブ（別窓のチャットも。`windowChats.ts`）は `dismissed` に覚えて出し直さず、一覧にないのに開いたチャットは `extra` で残す。アーカイブ・削除のあとは覚えない。
- 一覧のペインのタブはサイドバーと同じ並び（`orderLikeSidebar`）で、落とすと手動の並びを変える。アーカイブ済みはタブの列だけの設定 `chatPanel:show-archived`。

## タブのまとまり（`ui/clusters/`）

- まとめ方は欄ごとに覚え（`useTabGrouping(surface)`）、チャットのタブだけに効く。
- 入るまとまりは `useTabClusters` で、サイドバー・ボードと同じ `bucketChats` の決め方・キー・色にする。並びは `clusterTabs`（`sortBuckets` と同じ順）。
- 描くのは欄の `Strip` の `ChatTabStrip`（土台の `TabBar` の骨に `bar(並べたタブ, 並び)` で入れる）。札を出すのは一覧のペインだけ（`useTabStrip` の `home`）。畳んだまとまりは表示中のタブだけを残す（`visibleClusterTabs`）。
- 札の並べ替え `useClusterReorder` とタブをグループへ落とす `useClusterTabDrop` は同じ枠なので `joinDropHandlers` でつなぐ。
- 札の右クリックの項目は「表示」のメニューと同じ部品（`HiddenGroupItems`・`BucketColorItem`・`ClusterShortItem`・`ArchivedChatsItem`）。

## 下書き（送る前の新しいチャット）

- 中身（書きかけの文・添付・名前・固定・作成先）は composer の下書きの店（`newChatDrafts.ts`）。タブは同じキーで指し、閉じたら種類の `dispose` が下書きと右の欄を捨てる。
- 開いている欄と開く操作は `ui/drafts/panelDrafts.ts`（`openNewChat`・`PlacedDraft`）。起動したら `restoreDraftTabs` がチャットのパネルに戻す。サイドバーの窓へ写す（`ui/panelFollow.ts`）。
