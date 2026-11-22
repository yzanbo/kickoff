# パレット（`src/features/palette`）

キーで開いて探して移る一覧。開くのはコマンド `palette.open`（`ui/contributes.ts`）。

| ファイル | 中身 |
|---|---|
| `ui/CommandPalette`・`sources.ts` | ⌘K（探す対象 `paletteSources` を持ち主が登録: プロジェクト・チャット（chatList）・ノート・中の文（notes・conversation）。操作の行は `group` を持つコマンド） |
| `@/features/conversation/ui/search/SearchPanel` | チャットの中の文言の全文検索（開く口は `ui/index.ts` の `openContentSearch`） |
| `@/features/chatList/ui/activeChats/` の `ActiveChatsPalette`・`Palette*Filter` | ⌘⇧A（作業中・回答待ち・未読・下書き） |
| 同じフォルダの `openActiveChats.ts`・`useAllWaiting.ts` | ⌘⇧A を開く口・右上の数（⌘⇧A の「すべて」と同じ数え方） |

- ⌘K は全体を探す、⌘F はページの中を探す（`src/foundation/ui/CLAUDE.md` の「ページの ⌘F」）。ピントがチャットの中なら、チャットの検索が先に受け取る。
- 行の印・札・まとめ方はサイドバーと同じもの（`StatusSlot`・`bucketChats`）。骨組みは土台の `kit/floating/PaletteDialog`、ピルは `PillGroup`。
- ノートの行へは `src/features/notes/CLAUDE.md` の「行へ移る」。ノートの一覧は探す対象に入れたときだけ読む。
