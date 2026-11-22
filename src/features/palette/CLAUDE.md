# パレット（`src/features/palette`）

キーで開いて探して移る一覧。開くのはコマンド `palette.open`（`ui/contributes.ts`）。

| ファイル | 中身 |
|---|---|
| `ui/CommandPalette`・`textSearchItems.tsx`（ノートの分は `@/features/notes/ui/paletteSource.tsx`） | ⌘K（名前と、チャット・ノートの中の文で探す） |
| `ui/SearchPanel` | チャットの中の文言の全文検索 |
| `@/features/chatList/ui/activeChats/` の `ActiveChatsPalette`・`Palette*Filter` | ⌘⇧A（作業中・回答待ち・未読・下書き） |
| 同じフォルダの `openActiveChats.ts`・`useAllWaiting.ts` | ⌘⇧A を開く口・右上の数（⌘⇧A の「すべて」と同じ数え方） |

- ⌘K は全体を探す、⌘F はページの中を探す（`src/foundation/ui/CLAUDE.md` の「ページの ⌘F」）。ピントがチャットの中なら、チャットの検索が先に受け取る。
- 行の印・札・まとめ方はサイドバーと同じもの（`StatusSlot`・`bucketChats`）。
- ノートの行へは `src/features/notes/CLAUDE.md` の「行へ移る」。ノートの一覧は探す対象に入れたときだけ読む。
