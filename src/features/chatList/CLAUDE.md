# チャットをまとめて並べる仕組み（`features/chatList`）
<!-- 行き先: src/features/chatList/ -->

サイドバー・ボード・パネルのタブのまとまり・状態ごとの一覧・⌘⇧A で共通の、まとめ方・数え方・開閉の記憶。場所ごとに書かず、ここを使う。

| ファイル | 中身 |
|---|---|
| `buckets.ts`・`useChatBuckets.ts` | 分ける純粋な関数 `bucketChats`・並び `sortBuckets`・画面の口 |
| `bucketHeads.ts`・`bucketHues.ts` | まとまりのキーと見出し・色 |
| `manualOrder.ts` | 手動の並び |
| `chatGrouping.ts`・`chatListFlags.ts` | まとめ方の選択肢・サイドバーの表示の切り替え |
| `StateCornerCounts`・`StateChatsPopover`・`StateChip` | 角の数・状態ごとの一覧・状態の札 |

## 決まり
<!-- 行き先: src/features/chatList/ -->

- まとまりのキーはプロジェクトを根にした道のりの形（`p3/g5/status:read`）。開閉の記憶・React の key・タブのまとまりにそのまま使う。
- 状態ごとの数は `features/chat/chatState.ts` の `stateCounts` だけで数える（`bucketChats` の `counts`・`chatsByState` も）。
- 状態の札の印はサイドバーの行と同じ `StatusSlot`（`bucketMark`）。
- 開閉は `FOLDS` 1 つに `<場所>:<キー>` で覚え、`hooks/useFold` を通す。
- まとめ方の選択肢と文言はサイドバーとタブの列で共通（`CHAT_GROUPINGS`）、覚えるのは別々。

## 落とし穴
<!-- 行き先: src/features/chatList/ -->

- 色は画面に出ているまとまりでなく、なりうるものすべてから決める（`projectBucketHues`。サイドバーとタブで同じ色にする）。
- `useFolds` の開閉は購読した snapshot から読む（保存先を直接読むと React Compiler が描画を使い回す）。
- アーカイブ済みを出すかは、サイドバー・タブの列・ボードで別の設定（つなげない）。
