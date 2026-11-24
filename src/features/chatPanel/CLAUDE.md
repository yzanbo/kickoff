# チャットのパネル（`features/chatPanel`）

チャットのタブの種類と、チャットを並べる欄（チャットのパネル `kanban`・右の欄 `agents`・チャットの別ウィンドウ `cwin`）。入れ物は `src/features/panel/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `LST-`。

## 地図
- `ui/chatTabKinds.ts`: チャット・新しいチャット・サブエージェント・子チャット・新しい子チャット（中身 `chatTabPages.tsx`・見た目 `chatTabFaces.tsx`・右クリック `chatTabMenus.tsx`）
- `ui/chatSurfaces.ts`: 欄の決まり（並べ方 `ChatTabStrip`・ボタン `ChatPanelAdds`・「表示」 `ChatViewMenu`）・`startNewChat`
- `ui/state/linkedTabs.ts`: サイドバーとの連動（`useLinkedTabs`・`linkedChatsExt`）・`usePanelChats`
- `ui/clusters/`: タブのまとまり（`useTabGrouping`・`useTabClusters`・`clusterTabs`）
- `ui/drafts/panelDrafts.ts`: 送る前の新しいチャットのタブ（`openNewChat`・`restoreDraftTabs`）・`ui/panelFollow.ts`（サイドバーの窓へ写す）

## 決まり
- タブはチャットを持たず ID で `useKnownChat` から引く。右クリックはサイドバーの行と同じ `ChatMenuItems` / `DraftMenuItems`。
- サイドバーと連動したタブは一覧が届いてからそろえ、足すのは一覧のペイン（`home`）だけ。連動したタブは閉じずに一覧のペインへ戻す。並びはサイドバーと同じ（`orderLikeSidebar`）。
- 送った新しいチャットのタブは同じ位置で置き換える（`replaceWithChat`）。右の欄の中身は `moveDraftSidePanel` で移す。
- まとまりはサイドバー・ボードと同じ `bucketChats` の決め方・キー・色・順。札を出すのは一覧のペインだけ。
- タブに出す項目は隠したものだけを覚え、まとまりの札に出る項目はタブに出さない（`groupedTabField`）。
- 下書きの中身は composer の店（`newChatDrafts.ts`）。タブは同じキーで指し、閉じたら種類の `dispose` が下書きと右の欄を捨てる。

## 落とし穴
- 表示だけ消したタブは `dismissed` に覚えて出し直さず、一覧にないのに開いたチャットは `extra` で残す。アーカイブ・削除のあとは覚えない。
- 表示中のタブは URL にするが、URL がもうほかのプロジェクトの画面なら書かない（`board/shownTabUrl.ts`。移る途中に元の欄のタブを閉じても上書きしない）。はじめて描いたときは変えない。
- 札の並べ替えとタブをグループへ落とすのは同じ枠なので `joinDropHandlers` でつなぐ。
- テスト: `ui/**/*.test.ts`。
