# タブの入れ物（`features/panel`）

タブを並べる欄。どの欄も同じ `Panel` / `usePanel` で、違いは欄の項目と欄の殻が渡す `frame` だけ（欄の項目・殻・タブの種類は持ち主の機能が出す）。チャットの部分は `src/features/chatPanel/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `BASE-`。

## 地図
- `ui/surface.ts`: 欄の口（`defineSurface`・`panelSurfaces`・`panelKey(欄, scope)`・`parsePanelKey`）。欄の一覧は `PANEL_SURFACE_IDS` が正
- `ui/kind.ts`: タブの種類の口（`defineTabKind`・`panelTabs`・`kindOf(tab)`）。`ui/tabs/`: 作る関数 `tabData.ts`・型 `panelTypes.ts`・`TabPageFrame`
- `ui/state/`: `panelReducer`（純粋）・店 `panelStore.ts`・操作 `actions.ts`（`openTab`・`openInFocusedPane`・`mapTabs`）
- `ui/layout/`: ペインの木 `paneTree.ts`・`paneLayout.ts`・`paneGeometry.ts`・ドラッグ `useTabDrag`・`tabTransfer.ts`・`tabDragOut.ts`
- `ui/TabBar`（並べ方は欄の `Strip`、既定 `PlainStrip`）・`ui/popout/`・`ui/openWith/`（開く場所 `terminalTargetOf`）
- 欄の殻: チャットのパネルと右の欄は `@/features/chatPanel/ui/`、右サイドバーは `@/features/projects/ui/rightSidebar/`、下のパネルは `@/features/terminal/ui/bottom/`

## 決まり
- 欄ごとの違い（出す種類・Esc・ボタン・空の案内・「表示」・`alwaysOpen`）は欄の項目に集める。`usePanel(欄, scope)` に渡すのは 2 つだけ。欄の数を文書・コードに書かない。
- 種類ごとの違いは分岐させず種類の項目から `kindOf(tab)` で引く。panel は機能を読まない。種類を足すときは作る関数・別ウィンドウの種類・AI に返す説明（userView）も直す。
- 状態を変えるのは `panelReducer` だけ（後始末・保存は店）。配置はいつもタブにそろえる（`reconcileLayout`）。
- 木はタブのキーだけを指し、1 つのタブは 1 つのペインにだけある。最後の 1 つのペインは閉じない。
- 範囲がチャットの ID かは `typeof scope === "number"` で見分ける。閉じてよいかは `confirmTabClose`（×・右クリック・ペインを閉じるの 3 か所）。
- ブラウザのタブはどこからでも右サイドバー、ターミナルは下のパネルに開く。
- 別ウィンドウの種類は持ち主の `ui/popoutKinds.ts` が登録し、メインを動かす操作は `windowBus.ts` で頼む（中身はウィンドウをまたげる値だけ）。

## 落とし穴
- `panelTabs` の登録は保存の読み戻しより前（登録の前に読むと種類が引けない）。
- 描き直しを広げない: `usePanel` は状態が同じ間は同じ物を返す。タブの中身には `panel.pageOps` を渡し、殻は `frame` を作り置く。
- 表示していないタブも hidden で残し、チャットはさらに `Activity` で止める。タブの中身は中身の直下に置いて style で重ね、分けても作り直さない。
- 別ウィンドウへ移すタブは後始末なしで閉じる（`closeTab` の `keep`。シェルを止めない）。保存するのは欄の持ち主のウィンドウだけ。
- ドラッグ中だけ中身の上に透明の覆いを置く（webview の上でも落とせる）。落とす位置は見た目の並びから `paneIndexOf` でペインの並びに直す。
- キー（Esc・⌘\）はピントのあるいちばん内側の欄だけが受ける。外側の欄の CSS は子セレクタで内側に効かせない。
- 右サイドバーと下のパネルは閉じても要素を残す（書きかけ・シェルをなくさない）。開閉で動く間は開き終えた幅のまま切り取る。
- 子チャットのウィンドウの ✕ はメインプロセスが止めて聞く（`beforeunload` では止められない）。
- テスト: `ui/state/*.test.ts`・`ui/layout/*.test.ts`・`ui/surfaces.test.ts`。
