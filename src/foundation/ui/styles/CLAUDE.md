# CSS の決まり（`src/foundation/ui/styles`）

入口 `@/app/renderer/styles/index.css` は土台の CSS だけを読み、機能の CSS は部品が import する。

## 口の一覧
- 層: `tokens`（`tokens.css`。末尾に画面のコードが与える変数）→ `base` → `vendor`（`*.vendor.css`）→ `ui` → `feature`（部品は `@layer feature { … }`）→ `state`。後ろの層が詳細度によらず勝つ。層の外は `*.unlayered.css`
- `types/`: 札・ピル・カード・浮く窓・帯・ボタン・行・木・開閉の型（色・枠・角・影は型の変数）。`layout.css`（ドラッグ領域の決まりは頭のコメント）

## 決まり
- 規則は部品の隣の `<部品>.css` に書き、部品の先頭で import。セレクタの最初のクラスは 1 つの領域の CSS だけが書く（ほかの領域の中だけで変えるなら `.自分:is(.入れ物 *)`）。
- 別のファイルの同じ詳細度の規則を上書きしない（読む順が決まらない）。基底を上書きする `@media` / `@container` は同じファイルの後ろ。
- 機能のクラスには大きさと並べ方だけを書く。新しいクラス名は領域の頭を付ける。使わないクラスは消す（組み立てて付ける頭 `state-` `status-` `tone-` などに気をつける）。
- 定義していない変数を使わない: 文字 `--fs-N`（会話は `--chat-fs-N`）・z-index `--z-*`・影 `--shadow-1〜3`・角丸は `tokens.css` の 3 段・状態の印 `--dot-*`・文字 `--state-*`（`--ok` / `--ng` / `--warn` は使わない）。
- 下線は使わない（打ち消し線はよい）。回る印は `--dot-running`。`:focus-visible` の頭に `:where(:root:not([data-modality="pointer"]))`。
- 大きさを決めたボタンは `padding: 0` と `place-items: center`（負の `margin` で合わせない）。狭いときは `@media` でなく `@container`。欄のまわりは `--gutter`。

## 落とし穴
- `contain: strict` は大きさが外で決まる箱だけ。`content-visibility: auto` は内側の要素に当て、`contain-intrinsic-size` は余白と枠を引いた高さ。
- 色の地のボタンは乗せると同じ色で少し暗く。ダイアログの幅は `--dialog-w`、組のボタンは `.split-button`、並べ替えの線は `dragAttrs`（`--drop-*`）、開閉で動く欄は `.slide-pane`（動きは `--panel-motion-*`）。Git・PR・CI の色は属性（`types/state-colors.css`）。
- `getComputedStyle` で読む変数は、名を変えたら読む側も直す。
- state の層に置くのは状態の印と、Markdown の中の HTML の要素にほかの CSS を当てない決まり（`markdown/MarkdownHtml.css`）だけ。
- ドラッグ領域の中で操作するものは `no-drag`（計算後のスタイルで確かめる）。
- テスト: `scripts/check-structure.mjs` の CSS の検査（最初のクラスの持ち主）・`node scripts/ui-audit-buttons.mjs`。
