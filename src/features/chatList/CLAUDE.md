# チャットの並べ方と見せ方（`src/features/chatList`）

サイドバー・ボード・パネルのタブのまとまり・状態ごとの一覧・⌘⇧A で共通の、まとめ方・数え方・開閉の記憶・並び順・行の操作。場所ごとに書かず、ここを使う。

## 地図

| ファイル | 中身 |
|---|---|
| `ui/buckets.ts`・`useChatBuckets.ts` | 分ける純粋な関数 `bucketChats`・並び `sortBuckets`・画面の口 |
| `ui/BucketTree.tsx`・`ChatRowList.tsx` | まとまりの木（見出しは使う側の表 `HeadTable`）・行の一覧 |
| `ui/bucketHeads.ts`・`bucketHues.ts` | まとまりのキーと見出し・色 |
| `ui/chatLayout.ts`・`chatOrder.ts`・`manualOrder.ts` | まとめ方と並び順（`useChatLayout`・`useChatOrder`）・手動の並び |
| `ui/chatGrouping.ts` | まとめ方の選択肢（要対応・太字の決まりは `@shared/chat/state.ts` の `needsAttention`・`showsBold`） |
| `ui/selection/chatSelection.ts` | 複数選択（`useChatSelectionState`・`SelectionBar`） |
| `ui/StateCornerCounts`・`StateChatsPopover`・`StateChip`・`StateStats` | 角の数・状態ごとの一覧・札・見出しの数（拡張点 `projectHeaderStats`） |
| `ui/ChatRowFace.tsx`・`chatItemProps.ts` | 行の中身（チャット・下書き）・行とカードの同じ操作 |
| `ui/activeChats/` | ⌘⇧A（中身は純粋な `activeChatGroups`。下書きと開き方は chatPanel の `ActiveChatsDialog` が渡す） |

行の部品 `ChatRow` は `@/features/sidebar/ui/`。

## 決まり

- まとまりのキーはプロジェクトを根にした道のりの形（`p3/g5/status:read`）。開閉の記憶・React の key・タブのまとまりにそのまま使う。
- 状態ごとの数は `@/features/chat/ui/state/chatState.ts` の `stateCounts` だけで数える（`bucketChats` の `counts`・`chatsByState` も）。
- 状態の札の印はサイドバーの行と同じ `StatusSlot`（`bucketMark`）。
- 開閉は `ui:fold` 1 つに `<場所>:<キー>` で覚え、`@/foundation/ui/hooks/useFold.ts` を通す。
- まとめ方の選択肢と文言はサイドバーとタブの列で共通（`CHAT_GROUPINGS`）、覚えるのは別々。まとめ方・並び順はすべてのプロジェクトに効く 1 つの設定。
- 手動の並びはプロジェクトの中の 1 本（`Chat.position`）。どの並び順でも落とすと見えている並びのまま保存し、手動に切り替える。
- 行の一覧は `ChatRowList` で描く（`ul.chat-rows` に手で `.map` を書かない）。
- 右クリックと「…」はパネルのタブと同じ `ChatMenuItems` / `DraftMenuItems`（同じ並び・文・アイコン。「移す」の 2 項目は共通の `ui/menu/MoveItems.tsx`）。固定・アーカイブ・削除のボタンを行に並べない。
- 複数選択はサイドバー全体で 1 つ（範囲は画面の並び `visibleRows`）。ボードも同じ部品を使う。

## 落とし穴

- パネルの一覧のペインのタブも `useChatOrder` で同じ並びにする（変えたら `src/features/chatPanel/CLAUDE.md` の「サイドバーとの連動」も見る）。
- 範囲の選択・↑↓・ドラッグは先に `ensureAllRows` で残りを描く。
- 色は画面に出ているまとまりでなく、なりうるものすべてから決める（`projectBucketHues`。サイドバーとタブで同じ色にする）。
- `useFolds` の開閉は購読した snapshot から読む（保存先を直接読むと React Compiler が描画を使い回す）。
- アーカイブ済みを出すかは、サイドバー・タブの列・ボードで別の設定（つなげない）。
- 作業中のチャット（子孫も）は、ほかのプロジェクトへの移動・アーカイブの落とし先に落とせない（`busyBlockReason`）。
- 落とし先は `startChatDrag` が覚えた ID を `accepts` で見る（dragover ではデータを読めない）。受けないものは `passThrough` で外へ渡す。
