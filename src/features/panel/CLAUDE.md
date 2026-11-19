# タブの入れ物（`features/panel`）
<!-- 行き先: src/features/panel/ -->

タブを並べる欄。8 つの欄（`board`・右サイドバー `side`・`bottom`・チャットの右の欄 `agents`・`memos`・`files`・別ウィンドウ `window`・`chatWindow`）は同じ `Panel` / `usePanel` で、違いは `SURFACES` と欄の殻が渡す `frame` だけ。
タブの中身のチャットは `features/chat/CLAUDE.md`、ターミナル・ブラウザは `features/terminal/CLAUDE.md`。

| フォルダ | 中身 |
|---|---|
| 直下 | `Panel`・`usePanel`・欄の決まり `surfaces.ts`・入れ子の口 `panelHost.ts` |
| `state/` | 状態（`panelReducer`・店 `panelStore.ts`・操作 `panelActions.ts`）・サイドバーとの連動・下書き・ブラウザの保存・別ウィンドウの写しと受け渡し |
| `layout/` | ペインの分割（`paneTree.ts`・`paneLayout.ts`・`paneSizes.ts`・`paneGeometry.ts`）・タブのドラッグ（`useTabDrag`・`tabTransfer.ts`・`tabDragOut.ts`） |
| `tabs/` | 種類の表 `tabKinds.ts`・型 `panelTypes.ts`・タブの列・中身 `PanelTabPage`・メニュー |
| `clusters/` | タブのまとまり |
| `board/`・`projectChat/`・`bottom/`・`agents/` | 欄の殻（チャットのパネル・右サイドバー・下のパネル・右の欄） |

## 欄の決まり（`SURFACES`）
<!-- 行き先: src/features/panel/ -->

- 欄ごとの違い（出す種類 `kinds`・Esc・ボタン・札など）は、作る側・描く側で分岐させず `SURFACES` に集める。
- 欄ごとに出すタブは 1 種類（`board` = チャット・`side` = ブラウザ・`bottom` = ターミナル）。新しいタブ・空の欄のボタンもその種類だけ。
- ブラウザのタブはどこから開いても右サイドバーに開く（`state/openBrowserTab.ts`）。ターミナルは下のパネルに開く。
- 状態は `panelKey(surface, scope)` で欄・画面ごとに覚える。`memoryPrefix` は下書きの保存のキーにも使うので変えない。
- 範囲がチャットの ID かは `typeof scope === "number"` で見分ける（プロジェクトの ID と取り違えない）。

## 状態（`state/`）
<!-- 行き先: src/features/panel/ -->

- 1 つの欄の状態（`PanelState`）は店（`panelStore.ts`）が覚え、変えるのはすべて純粋関数の `panelReducer`（後始末・保存は店）。部品は `usePanelState` と `dispatchPanel`、外からは `panelActions(key)`。
- 配置はいつもタブにそろえておく（`reconcileLayout`。理由は `PanelState` の JSDoc）。
- 描き直しを広げない: `usePanel` は状態が同じ間は同じ物を返し、`Panel`・`PanelTabPage` は memo。タブの中身には `PanelController` でなく `panel.pageOps` を渡し、殻は `frame` を作り置く。
- 表示していないタブも hidden で残す。チャットの会話・サブエージェント・子チャットはさらに `Activity` で止め、止めると切れる操作の間は `tabs/tabKeepAlive.ts` で止めない。
- 表示中かは `TabVisibleContext` で入れ子の欄へ伝える。チャットのタブの中身は初めて表示したときに作る（`TabKindSpec.lazy`）。
- 右サイドバーのブラウザは `browserSession.ts` で残す。保存するのは欄の持ち主のウィンドウだけ（`setPanelOwnership`）。別ウィンドウの店はメインのウィンドウの写し（`panelMirror.ts`）。

## タブの種類（`tabs/tabKinds.ts`）
<!-- 行き先: src/features/panel/ -->

- 種類（`panelTypes.ts` の `PanelTab`）ごとの違い（キー・名前・後始末・`popout` など）は、種類で分岐させず `TAB_KINDS` から引く。中身は `PanelTabPage` の `PAGES`。
- キーはチャットが `chatKey(id)`（1 チャット 1 タブ）、サブエージェントが `agentTabKey`、ほかは `newTabKey`（ターミナルのキーは裏のシェルのキーにも使う）。
- 種類を足すときは、作る関数・`panelActions` の `open…`・`app/popout.ts`・`app/PopoutApp.tsx`・`features/popout/dockPopout.ts`・`tabWindow.ts`・`app/userViewCollect.ts` も直す。
- ほかにも `agents/AgentPanelAdds.tsx`・`features/worktree/repointTabs.ts`・`layout/tabTransfer.ts`・`lib/storageKeys.ts` の保存の型・`PaneTab.tsx` の名指しを見る。
- 別ウィンドウへ移すタブは後始末なしで閉じる（`closeTab` の `keep`。ターミナルのシェルを止めない）。
- 右クリックの `TabMenu` はサイドバーの行と同じ `ChatMenuItems` / `DraftMenuItems`。状態の印はどの種類も `useTabAgentState`（店から読む）。
- タブに出す項目（`tabFields.ts`）は隠したものだけを覚える。まとまりの札に出る項目はタブに出さない（`groupedTabField`。保存した選び方は変えない）。
- 新しいチャットのタブは送ると同じ位置で `replaceWithChat`、右の欄の中身は `moveDraftSidePanel` で移す。

## サイドバーとの連動（`state/linkedTabs.ts`）
<!-- 行き先: src/features/chatPanel/ -->

- チャットのタブは、サイドバーに出ているチャット（`useLinkedChats`）に、一覧が届いてから `syncLinkedTabs` でそろえる。
- 足すのは一覧のペイン（`PaneLayout.home`）だけ（理由は `panelReducer` の `sync` のコメント）。
- 表示だけ消したタブは `dismissed` に覚えて出し直さず、一覧にないのに開いたチャットは `extra` で残す。アーカイブ・削除のあとは覚えない。
- 一覧のペインのタブはサイドバーと同じ並び（`orderLikeSidebar`）で、落とすと手動の並びを変える。アーカイブ済みはタブの列だけの設定 `PANEL_SHOW_ARCHIVED`。

## ペインの分割（`layout/`）
<!-- 行き先: src/features/panel/ -->

- 配置は木とピントのあるペイン `focused`・一覧のペイン `home`（`paneTree.ts`）。木はタブのキーだけを指し、1 つのタブは 1 つのペインにだけある。
- 変え方は純粋関数（`paneLayout.ts`・`paneSizes.ts`）、位置と落とす場所は `paneGeometry.ts`。最後の 1 つのペインは消さない。
- タブの中身はいつも中身の直下に置いて style で重ね、分けても作り直さない（`PanelTabPage` のコメント）。
- ドラッグ中だけ中身の上に透明の覆いを置く（webview の上でも落とせる。`useTabDrag`）。
- パネルの外からタブにして落とすものは `beginExternalTabDrag` で知らせ、落としたらタブを開いてから移す。
- ウィンドウの外へ離すと別ウィンドウで開く（`tabDragOut.ts`）。ほかのウィンドウの欄へは `tabTransfer.ts`（落とした側が開き直し、元は後始末なしで閉じる）。
- 落とす位置は見た目の並びで印を付け、`paneIndexOf` でペインの並びに直す（まとまりの境目は `insertSlotAt`）。

## タブの列（`tabs/PaneTabBar`）
<!-- 行き先: src/features/panel/ -->

- 表示の選び方は「表示」のメニュー（`usePanelViewMenu`）1 つにまとめ、右クリックの「タブの表示 ›」と同じ `TabDisplayItems` を使う。項目を足したら `usePanelViewReset` にも足す。
- 色のあるタブは `--tab-color` 1 つで示す（タブと画面の面は `side-panel-tab-sheet.css`）。
- タブの列を隠す欄（`hideableTabs`）では、隠している間は覚えた横幅いっぱいを効かせない（`usePanelWidth` の `maximizable`）。

## タブのまとまり（`clusters/`）
<!-- 行き先: src/features/chatPanel/ -->

- まとめ方は欄ごとに覚え（`useTabGrouping(surface)`）、チャットのタブにだけ効く。
- 入るまとまりは `useTabClusters` で、サイドバー・ボードと同じ `bucketChats` の決め方・キー・色にする。並びは `clusterTabs`（`sortBuckets` と同じ順）。
- 札を出すのは一覧のペインだけ（`useTabStrip` の `home`）。畳んだまとまりは表示中のタブだけを残す（`visibleClusterTabs`）。
- 札の並べ替え `useClusterReorder` とタブをグループへ落とす `useClusterTabDrop` は同じ枠で受けるので、`joinDropHandlers` でつなぐ。
- 札の右クリックの項目は「表示」のメニューと同じ部品（`HiddenGroupItems`・`BucketColorItem`・`ClusterShortItem`・`ArchivedChatsItem`）。

## 下書き（送る前の新しいチャット）
<!-- 行き先: src/features/chatPanel/ -->

- 下書き（`panelDrafts.ts`）を変える操作（`setDraftGroup`・`setDraftTitle` など）は、欄が画面になくても覚えている内容を書き換える。名前の出し方は `draftDisplayTitle` 1 つ。
- 再起動しても残すのは下書きのタブだけ（`draftPersistence.ts`）。書きかけは入力欄に 1 回だけ戻し、外した添付は戻さない。

## 欄の殻
<!-- 行き先: src/features/panel/ -->

- チャットのパネル（`board`）は `CHAT_PLACEMENT` でチャットタブかボードの右に置く（同じ状態。共通は `useProjectChatsPanel`）。ボードは開く先を `BoardChats` だけで見る。
- タブで選んだチャットを URL にするが、はじめて描いたときは変えない（`useBoardPanel.ts` のコメント）。
- 幅と覆う決まりは `hooks/useCoverableWidth` で共通。開閉で動いている間は開き終えたときの幅のまま切り取り、中身を並べ直さない。
- 右サイドバー（`ProjectChat`）と下のパネル（`BottomPanel`）は閉じても要素を残す（書きかけ・シェルをなくさない）。
- 右サイドバーのブラウザは、ほかの中身を見ている間も隠して置く（中身は `SideRail` で選ぶ）。
- 右の欄（`AgentSplit`）はチャットのタブの中の入れ子のパネルで、`PanelHostContext` で受ける（理由は `panelHost.ts`）。パネルの外では置かない。
- キーはピントのあるいちばん内側の欄だけが受け取る（`focusedPanelKey`・`focusInNestedPanel`）。外側の欄の CSS は `:not(:where(.agent-panel *))` で内側に効かせない。
- 右の欄の ⌘F（`AgentPanelFind`）はエディタ・子チャットの検索に任せる。親のチャットの画面のキーは右の欄の中で受け取らない（`isChatTarget`）。
- 右サイドバーと最大表示の下のパネルの上の行は `.panel-window-titlebar` にそろえ、信号機・戻る / 進むと重ねない。
- 欄の開閉の動きは `--panel-motion-duration` / `--panel-motion-ease` にそろえる（`styles/CLAUDE.md`）。

## 別ウィンドウ（`features/popout`・`app/popout*.ts`）
<!-- 行き先: src/features/panel/ -->

- 行き先は `#/popout/<種類>`（`app/popout.ts`）。`PopoutApp` は App の一部だけを描き、URL を画面として購読しない。
- メインの画面・ダイアログを動かす操作は `app/windowBus.ts` でメインに頼む（中身はウィンドウをまたげる値だけ）。
- サイドバーのウィンドウの店はメインの写し（`panelMirror.ts`）、チャット欄のウィンドウは持ち主ごと移す（`panelHandOff.ts`）。
- 子チャットのウィンドウの ✕ はメインプロセスが止めて聞く（`beforeunload` では止められない。`src/main/app/popouts.ts`）。
