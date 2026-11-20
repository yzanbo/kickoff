# CSS の決まり

画面の CSS（`src/app/renderer/styles/`。下のパスはそこから）。領域ごとのフォルダのファイルを `index.css` の `@import` でつなぐ。

## 層と順
- `index.css` は先頭の `@layer …;` と `@import … layer(…)` だけ。1 ファイル 300 行以内。
- 層は前から `tokens`（`base/tokens`。末尾に画面のコードが与える変数）・`base`（リセット・ピント・スクロールバー）・`vendor`（部品の隣の `*.vendor.css`）・`ui`・`feature`（機能と殻の `base/layout` ほか）。後ろの層が詳細度によらず勝つ。
- 実行時に style を差す CodeMirror・Monaco の上書きは層の外の `*.unlayered.css`。xterm・codicon の CSS も層の外（直に import）。
- 別のファイルの同じ詳細度の規則を上書きしない。上書きは詳細度か、同じファイルの後ろで。

## 置き場所
- 規則はその機能のファイルに書く（部品が `src/features/<機能>/` にあるなら同じ領域のサブフォルダ）。複数の画面で使う部品は `ui/`。
- 新しいファイルは `index.css` の同じ層の並びに `@import` を足す。
- 基底を上書きする `@media` / `@container` は、その基底と同じファイルの後ろに置く。

## 書き方
- 既存のクラスを使い、同じ宣言のブロックを増やさない。1 行で省略する 3 点（`overflow` `text-overflow` `white-space`）は各規則に書いてよい。
- 札・ピル・カード・浮く窓・色の帯・見出しの帯は `ui/types/` の型を付け、色・枠・角・影は型の変数で入れる。機能のクラスには大きさと並べ方を書く。
- 効かない指定を書かない（足したら計算後のスタイルで確かめる）。
- 大きさを決めたボタンには必ず `padding: 0` を書き、中身は `place-items: center` で真ん中に置く（負の `margin` で合わせない）。アイコンだけなら `IconButton`。大きさは className で `width` / `height` だけ上書きする。
- 色の地のボタン（`.btn-primary`・`.btn-danger`）は、乗せても同じ色の地で少し暗くする（それぞれに `:hover:not(:disabled)`）。
- ダイアログの下の地のないボタンは `--bg-hover` の地と見える枠（`ui/app-dialogs.css`）。2 つを 1 つに見せる組は、乗せたときの地を外側に付ける（`.panel-split-button`）。
- 使わなくなったクラスは消す。名前を組み立てて付けるクラスに気をつける（頭 `state-` `status-` `tone-` `meter-` `conn-` `drop-` `line-` `dock-` `held-` `todo-` `inspection-` `provider-` `head-menu-` `head-count-`、`.pr-chip` の状態、一番下へのボタンの状態）。
- 新しいクラス名は `styles/` 全体と組み立てるクラスを検索してから付け、1 語は避けて領域の頭を付ける。
- 状態の色: 印は `--dot-*`、状態の文字は `--state-*`（`--ok` / `--ng` / `--warn` は使わない）。アクセントの色の文字は `--accent-fg`。
- 下線は使わない（押せる名前は `.link-button.hover-bg`、行・カードは `--bg-hover`、リンクは色だけ）。打ち消し線はよい。
- 回る印と跳ねる点は、どこでも `--dot-running`（押せるボタンの中だけはボタンの文字の色）。
- `:focus-visible` の規則の頭には `:where(:root:not([data-modality="pointer"]))` を付ける（`@/foundation/ui/lib/inputModality.ts`。マウスで操作している間は枠を出さない）。
- 定義していない CSS 変数を使わない。画面のコードが与える変数は `base/tokens.css` の末尾に書く。文字の大きさ 10〜15px は `--fs-N`（会話は `--chat-fs-N`）、z-index の 10 以上は `--z-*`、影は `--shadow-1〜3`。`getComputedStyle` で読む変数は名前を変えたら読む側も直す。
- プロジェクトの札の色は `project/project-mark.css` 1 か所。

## 大きさと余白
- `contain: strict` は大きさが外で決まる箱にだけ付ける（中身で高さが決まる箱は 0 に潰れる）。
- `content-visibility: auto` は、外へはみ出す飾りを持つ要素でなく内側の要素に当てる。`contain-intrinsic-size` は余白と枠を引いた中身の高さを書く。
- 欄の左右と、真ん中の画面の中身の枠のまわりは `--gutter` にそろえる（一部だけ狭く・広くしない）。プロジェクトの画面はタブで幅を変えない。
- 狭いときの並べ方は `@media` でなく `@container`（真ん中の幅はウィンドウより欄の幅で変わる）。
- 欄の開閉の動きは `--panel-motion-duration` / `--panel-motion-ease`。開閉で大きさが動く欄は、中身を開いたときの大きさのまま置いて切り取る。

### 角丸
- `base/tokens.css` の 3 段とピル・丸だけを使い、数を直に書かない: 小 `--radius-sm` = 押す物と行、中 `--radius` = 面、大 `--radius-lg` = 浮く窓と大きなアイコンのタイル、ピル `999px`・丸 `50%`（高さの半分を px で書かない）。
- 内側は外側より丸くしない（枠に沿わせる角は `calc(var(--radius) - 1px)`）。1〜5px の飾りと 16px 以下の小さな印だけは直に書いてよい。

## Electron のドラッグ領域
- ドラッグ領域（`.page-header` `.sidebar-header`・欄のタブの列）の中で操作するものには `-webkit-app-region: no-drag`（JS のクリックでは再現しないので計算後のスタイルで確かめる）。
- ドラッグ領域は `overflow: hidden` で切られない。閉じても大きさを残す欄は、閉じ終えたら `visibility: hidden`（開くときはすぐ見せる）。
- 入れ子の右の欄（`.agent-panel`）のタブの列はドラッグ領域にしない（外側の規則から `:not(:where(.agent-panel *))` で外す）。
- ドラッグ領域は後に書いた要素が勝つので、閉じたサイドバーの開くボタン・左上の画面移動・右上の開閉は DOM の最後に置く。全体表示中の見出し（`base/maximized-header.css`）はドラッグ領域より後、固定のボタンより前。
- 外側のクリックで閉じるものが開いている間は、`<html data-dismissable>` でドラッグ領域を止める（`base/layout.css`）。
- 左上の画面移動（`base/navigation.css`）はサイドバー・パネルの中に置かず固定し、空きは `.layout` の `--app-navigation-left` / `--app-titlebar-left-end` でそろえる。
