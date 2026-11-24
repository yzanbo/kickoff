# AI が描く図（`features/visuals`）

AI が返答に描く図（SVG・HTML）と、図を入れる枠。受け入れの一覧: `docs/features.md` の `CHT-`。

## 地図
- `core/aiVisual.ts`（ツール）・`core/tools.ts`（組とシステムプロンプトの「図と数式」の節）・`core/index.ts`（枠のページ `/visual-frame`）
- `ui/VisualFrame`・`useFrameSlot`・`visualTheme.ts`

## 決まり
- 図の iframe は砂場（`allow-same-origin` なし・図だけの CSP）。図から送る発言は、利用者が枠の中を押したときだけ受ける（`pressedInside`）。
- 枠は画面の手前まで来てから置き、同時に読み込むのは `useFrameSlot` の数まで。触った図は `data-keep-row` で窓から外さない。
- 高さの覚えのキーは図の ID とソースの指紋（ソースそのものを抱えない）。
- ノートに保存は `open({ kind: "noteFromVisual" })`（保存は notes の `saveVisualNote.ts`）。

## 落とし穴
- 書いている間の表示は chat が `DRAWING_TOOLS` で見分ける。
- テーマを変えたら SVG は変数だけを送り、HTML は読み直す。テーマの値は `@/foundation/ui/styles/tokens.css` の末尾の一覧から読む（変数を足したら一覧も直す）。
- 中のページは上限より低い中身で縦のスクロールバーを出さない（幅が縮んで高さが行き来する）。
- テスト: `core/*.test.ts`・`ui/*.test.ts`。
