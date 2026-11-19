# パレット（`features/palette`）
<!-- 行き先: src/features/palette/ -->

キーで開いて探して移る一覧。開くのは App（`app/shortcuts.ts`）。

| ファイル | 中身 |
|---|---|
| `CommandPalette`・`usePaletteMemos`・`textSearchItems.tsx` | ⌘K（名前と、チャット・メモの中の文で探す） |
| `SearchPanel` | チャットの中の文言の全文検索 |
| `ActiveChatsPalette`・`Palette*Filter` | ⌘⇧A（作業中・回答待ち・未読・下書き） |
| `openActiveChats.ts`・`useAllWaiting.ts` | ⌘⇧A を開く口・右上の数（⌘⇧A の「すべて」と同じ数え方） |

- ⌘K は全体を探す、⌘F はページの中を探す（画面全体の `CLAUDE.md` の「ページの ⌘F」）。ピントがチャットの中なら、チャットの検索が先に受け取る。
- 行の印・札・まとめ方はサイドバーと同じもの（`StatusSlot`・`bucketChats`）。
- メモの行へは `features/memo/CLAUDE.md` の「行へ移る」。メモの一覧は探す対象に入れたときだけ読む。
