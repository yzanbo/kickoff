# AI が描く図（`src/features/visuals`）

## 図（`ui/`）

- AI のツールは `core/aiVisual.ts`（決まりは `src/features/chat/CLAUDE.md` の「AI の操作ツールの中身」）。
- 枠は `VisualFrame`（`allow-same-origin` なし）。図から送る発言は、利用者が枠の中を押したときだけ受ける（`pressedInside`）。理由は各関数の JSDoc。
- 枠は画面の手前まで来てから置き、同時に読み込むのは `useFrameSlot` の数まで。触った図は `data-keep-row` で窓から外さない。
- テーマを変えたら SVG は変数だけを送り、HTML は読み直す。テーマの値は `visualTheme.ts` が `@/app/renderer/styles/base/tokens.css` の末尾の一覧から読む（変数を足したら一覧も直す）。
- 中のページは、上限より低い中身では縦のスクロールバーを出さない（幅が縮んで高さが変わり、行き来する）。
