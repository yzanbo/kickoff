# タブの入れ物（`src/features/panel`）

タブを並べる欄。8 つの欄（チャットのパネル `kanban`・右サイドバー `side`・`bottom`・チャットの右の欄 `agents`・`notes`・`files`・別ウィンドウ `win`・`cwin`）は同じ `Panel` / `usePanel` で、違いは欄の項目と欄の殻が渡す `frame` だけ（`kanban`・`agents`・`cwin` は chatPanel の `chatSurfaces.ts`）。
パスは `ui/` から。チャットの部分（サイドバーとの連動・タブのまとまり・下書き・右の欄）は `src/features/chatPanel/CLAUDE.md`、タブの中身のチャットは `src/features/conversation/CLAUDE.md`、ターミナルは `src/features/terminal/CLAUDE.md`、ブラウザは `src/features/browser/CLAUDE.md`。

| フォルダ | 中身 |
|---|---|
| 直下 | `Panel`・`usePanel`・タブの列の骨 `TabBar`（既定の並べ方 `PlainStrip`）・種類の口 `kind.ts`・欄の口 `surface.ts`（移していない 5 欄は `surfaces.ts`）・入れ子の欄のピント `panelHost.ts` |
| `state/` | 状態（`panelReducer`・店 `panelStore.ts`・操作 `actions.ts`）・別ウィンドウの写しと受け渡し |
| `layout/` | ペインの分割（`paneTree.ts`・`paneLayout.ts`・`paneSizes.ts`・`paneGeometry.ts`）・タブのドラッグ（`useTabDrag`・`tabTransfer.ts`・`tabDragOut.ts`） |
| `tabs/` | 持ち主へ移していない 8 種類 `tabKinds.ts`・作る関数 `tabData.ts`・型 `panelTypes.ts`・タブ 1 つ `PaneTab`・中身の枠 `TabPageFrame`（移していない中身は `PanelTabPage`）・メニュー・先読み |
| `popout/`・`openWith/` | 別ウィンドウのタブ（`tabWindow.ts`）・外のアプリで開く（新しいタブのボタン `OpenWithAdds`） |

欄の殻はそれぞれの持ち主にある: チャットのパネルと右の欄は `@/features/chatPanel/ui/`（`board/`・`agents/`）、右サイドバーは `@/features/projects/ui/rightSidebar/`、下のパネルは `@/features/terminal/ui/bottom/`。

## 欄の決まり（`surface.ts`）

- 欄ごとの違い（出す種類・Esc・ボタン・空の案内 `EmptyHint`・「表示」の中身 `ViewMenu`・いつも開く `alwaysOpen` など）は欄の項目に集め、`panelSurfaces` で受ける。`usePanel(欄, scope)` に渡すのは 2 つだけ。
- 欄ごとに出すタブは 1 種類（`kanban` = チャット・`side` = ブラウザ・`bottom` = ターミナル）。
- ブラウザのタブはどこから開いても右サイドバーに開く（`@/features/browser/ui/panel/openBrowserTab.ts`）。ターミナルは下のパネルに開く。
- 状態は `panelKey(欄, scope)` で欄・画面ごとに覚える。
- 範囲がチャットの ID かは `typeof scope === "number"` で見分ける（プロジェクトの ID と取り違えない）。

## 状態（`state/`）

- 1 つの欄の状態（`PanelState`）は店（`createPanelStore`。起動で 1 つ入れる。テストは `testing.ts`）が覚え、変えるのはすべて純粋関数の `panelReducer`（後始末・保存は店）。部品は `usePanelState`、操作は `actions.ts` の関数（`openTab(欄, 作る関数のタブ)` など）。
- 配置はいつもタブにそろえておく（`reconcileLayout`。理由は `PanelState` の JSDoc）。
- 描き直しを広げない: `usePanel` は状態が同じ間は同じ物を返し、`Panel`・`TabPageFrame` は memo。タブの中身には `PanelController` でなく `panel.pageOps` を渡し、殻は `frame` を作り置く。
- 表示していないタブも hidden で残す。チャットの会話・サブエージェント・子チャットはさらに `Activity` で止め、止めると切れる操作の間は `@/features/chat/ui/screen/keepAlive.ts` で止めない。
- 表示中かは `TabVisibleContext` で入れ子の欄へ伝える。チャットのタブの中身は初めて表示したときに作る（種類の `createWhen: "shown"`）。
- 右サイドバーのブラウザは `@/features/browser/ui/panel/browserSession.ts` で残す。保存するのは欄の持ち主のウィンドウだけ（`setPanelOwnership`）。別ウィンドウの店はメインのウィンドウの写し（`panelMirror.ts`）。

## タブの種類（`kind.ts`）

- 種類（`panelTypes.ts` の `PanelTab`）ごとの違い（名前・後始末・`popout`・中身 `Page`・見た目 `Face`・`Menu`・`close`・`rename`・`confirmClose` など）は、分岐させず種類の項目（`defineTabKind`・`panelTabs`）から `kindOf(tab)` で引く。
- 種類は持ち主の `ui/contributes.ts` が入れる（チャットの 5 種類は chatPanel・ファイルは files・ノートは notes・ブラウザは browser）。
- キーはチャットが `chatKey(id)`（1 チャット 1 タブ）、サブエージェントが `agentTabKey`、ほかは `newTabKey`（ターミナルのキーは裏のシェルのキーにも使う）。
- 種類を足すときは、作る関数（`tabData.ts`）・`@/app/renderer/popout/contributes.ts`・`@/app/renderer/PopoutApp.tsx`・`@/app/renderer/popout/dockPopout.ts`・`tabWindow.ts`・`@/features/userView/ui/userViewCollect.ts` も直す（`AgentPanelAdds`・`repointTabs.ts`・`tabTransfer.ts`・`popoutWindowTab.ts` の名指しも見る）。
- 別ウィンドウへ移すタブは後始末なしで閉じる（`closeTab` の `keep`。ターミナルのシェルを止めない）。
- 閉じてよいかは `confirmTabClose`（×・右クリックの「タブを閉じる」・ペインを閉じるの 3 か所）。

## ペインの分割（`layout/`）

- 配置は木とピントのあるペイン `focused`・一覧のペイン `home`（`paneTree.ts`）。木はタブのキーだけを指し、1 つのタブは 1 つのペインにだけある。
- 変え方は純粋関数（`paneLayout.ts`・`paneSizes.ts`）、位置と落とす場所は `paneGeometry.ts`。最後の 1 つのペインは消さない。
- タブの中身はいつも中身の直下に置いて style で重ね、分けても作り直さない（`TabPageFrame` のコメント）。
- ドラッグ中だけ中身の上に透明の覆いを置く（webview の上でも落とせる。`useTabDrag`）。
- パネルの外からタブにして落とすものは `beginExternalTabDrag` で知らせ、落としたらタブを開いてから移す。
- ウィンドウの外へ離すと別ウィンドウで開く（`tabDragOut.ts`）。ほかのウィンドウの欄へは `tabTransfer.ts`（落とした側が開き直し、元は後始末なしで閉じる）。
- 落とす位置は見た目の並びで印を付け、`paneIndexOf` でペインの並びに直す（まとまりの境目は `insertSlotAt`）。

## タブの列（`TabBar`）

- 並べ方は欄の `Strip`（なければ `PlainStrip`）で、並べたタブを `bar(中身, 並び)` で骨に入れる。タブのすぐ右のボタンは欄の `Adds`。
- 分けるボタンと ⌘\ は `splitShownTab`。「表示」のメニューの項目を足したら `usePanelViewReset` にも足す。
- 色のあるタブは `--tab-color` で示す（タブと画面の面は `side-panel-tab-sheet.css`）。
- タブの列を隠す欄（`hideableTabs`）では、隠している間は覚えた横幅いっぱいを効かせない（`usePanelWidth` の `maximizable`）。

## 欄の殻

- チャットのパネル（`board`）は `CHAT_PLACEMENT` でチャットタブかボードの右に置く（同じ状態。共通は `useProjectChatsPanel`）。ボードは開く先を `BoardChats` だけで見る。
- タブで選んだチャットを URL にするが、はじめて描いたときは変えない（`@/features/chatPanel/ui/board/useBoardPanel.ts` のコメント）。
- 幅と覆う決まりは `useCoverableWidth` で共通。開閉で動いている間は開き終えたときの幅のまま切り取り、中身を並べ直さない。
- 右サイドバー（`ProjectChat`）と下のパネル（`BottomPanel`）は閉じても要素を残す（書きかけ・シェルをなくさない）。
- 右サイドバーのブラウザは、ほかの中身を見ている間も隠して置く（中身は `SideRail` で選ぶ）。
- 右の欄（`AgentSplit`）はチャットのタブの中の入れ子のパネルで、置くのは `ChatHost.side`（chatPanel の `sidePanelPort`）を渡した画面だけ。
- キー（Esc・⌘\）は `usePanelShortcuts` で、ピントのあるいちばん内側の欄だけが受け取る。外側の欄の CSS は子セレクタで内側に効かせない。
- 右の欄の ⌘F（`AgentPanelFind`）はエディタ・子チャットの検索に任せる。親のチャットの画面のキーは右の欄の中で受け取らない（`isChatTarget`）。
- 右サイドバーと最大表示の下のパネルの上の行は `.panel-window-titlebar` にそろえ、信号機・戻る / 進むと重ねない。
- 欄の開閉の動きは `--panel-motion-duration` / `--panel-motion-ease` にそろえる（`src/foundation/ui/styles/CLAUDE.md`）。

## 別ウィンドウ（`popout/`・`@/foundation/ui/navigation/popout.ts`・`@/app/renderer/PopoutApp.tsx`）

- 行き先は `#/popout/<種類>`（種類の表は `@/app/renderer/popout/contributes.ts`）。`PopoutApp` は App の一部だけを描き、URL を画面として購読しない。
- メインの画面・ダイアログを動かす操作は `@/foundation/ui/navigation/windowBus.ts` でメインに頼む（種類は持ち主の機能の `windowMessages.ts` が足す。中身はウィンドウをまたげる値だけ）。
- サイドバーのウィンドウの店はメインの写し（`panelMirror.ts`）、チャット欄のウィンドウは持ち主ごと移す（`panelHandOff.ts`）。
- 子チャットのウィンドウの ✕ はメインプロセスが止めて聞く（`beforeunload` では止められない。`@/foundation/desktop/app/popouts.ts`）。

## 外のアプリで開く（`openWith/`）

- 開く場所は `terminalTargetOf` 1 つで決める。チャットの見出しに外部のターミナルのボタンを置かない（パネルの ▾ に集める）。
