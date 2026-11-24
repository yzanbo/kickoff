# パレット（`features/palette`）

キーで開いて探して移る一覧（⌘K）。開くのはコマンド `palette.open`（`ui/contributes.ts`）。受け入れの一覧: `docs/features.md` の `LST-`。

## 地図
- `ui/CommandPalette`・`ui/sources.ts`: 探す対象 `paletteSources`（持ち主が登録: プロジェクト・チャット・ノート・中の文。操作の行は `group` を持つコマンド）
- チャットの中の文言の全文検索は `@/features/conversation/ui/search/SearchPanel`（開く口 `openContentSearch`）
- ⌘⇧A（作業中・回答待ち・未読・下書き）は `@/features/chatList/ui/activeChats/`

## 決まり
- 探す対象は `paletteSources` で受ける（palette は機能を読まない）。ノートの一覧は探す対象に入れたときだけ読む。
- ⌘K は全体、⌘F はページの中（`@/foundation/ui/kit/usePageFind`）。ピントがチャットの中ならチャットの検索が先に受ける。
- 行の印・札・まとめ方はサイドバーと同じ（`StatusSlot`・`bucketChats`）。骨組みは `kit/floating/PaletteDialog`。

## 落とし穴
- ↑↓ で選んだ行は見える所へ寄せる。
- テスト: `ui/sources.test.ts`。
