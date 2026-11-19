# CSS（`src/renderer/src/styles`）の決まり

画面の CSS。領域ごとのサブフォルダ（`base/` `ui/` `chat/` `panel/` など）のファイルを、`index.css` の `@import` の順（＝カスケードの順）で 1 つにつなぐ。

## ファイルと順
<!-- 行き先: src/foundation/ui/styles/ -->
- `index.css` には `@import` 以外を書かない。1 ファイル 300 行以内。並びは `index.css` が持つ（ここに写さない）。
- 順を変えるとカスケードの勝ち負けが変わる。先頭は `base/tokens`（変数。末尾に画面のコードが与える変数の一覧）→ `base/base`（小さな共有クラス。後ろの部品に負ける前提）。
- 汎用の部品は、それを使う画面より前に置く。上書きする側は後ろ（`chat/visuals` は `ui/markdown` の後ろ）。

## 置き場所
<!-- 行き先: src/foundation/ui/styles/ -->
- 規則はその機能のファイルに書く（部品が `features/<領域>/` にあるなら同じ領域のサブフォルダ）。複数の画面で使う部品は `ui/buttons-forms.css` か `ui/menu.css`。
- 新しいファイルは `index.css` の該当する位置に `@import` を足す（`base/base` より後ろ）。
- 基底を上書きする `@media` / `@container` は、その基底と同じファイルの後ろに置く（`base/mobile.css` に、後ろのファイルの基底に負けるものを置かない）。

## 書き方
<!-- 行き先: src/foundation/ui/styles/ -->
- 既存のクラスを使い、同じ宣言のブロックを増やさない。1 行で省略する 3 点（`overflow` `text-overflow` `white-space`）は各規則に書いてよい（共通クラスにすると勝ち負けが変わる）。
- 同じ詳細度で後ろのルールに負けて効かない指定を書かない。足したら計算後のスタイルで確かめる。
- 大きさを決めたボタンには必ず `padding: 0` を書き、中身は `place-items: center` で真ん中に置く（`margin` の負の値・`top` で合わせない）。アイコンだけなら `IconButton`。大きさは className で `width` / `height` だけ上書きする。
- 色の地のボタン（`.btn-primary`・`.btn-danger`）は、乗せても同じ色の地で少し暗くする（`.btn:hover` に負けないよう、それぞれに `:hover:not(:disabled)`）。
- ダイアログの下の地のないボタンは `--bg-hover` の地と見える枠（`ui/app-dialogs.css`）。2 つを 1 つに見せる組は、乗せたときの地を外側に付ける（`.panel-split-button`）。
- 使わなくなったクラスは消す。名前を組み立てて付けるクラスに気をつける（頭 `state-` `status-` `tone-` `meter-` `conn-` `drop-` `line-` `dock-` `held-` `todo-` `inspection-` `provider-` `head-menu-` `head-count-`、`.pr-chip` の状態、一番下へのボタンの状態）。
- 新しいクラス名は `styles/` 全体と組み立てるクラスを検索してから付ける。1 語の名前は避け、領域の頭を付ける（`.rail` がサイドバーの `.workspaces.rail` に当たった）。
- 状態の色: 印は `--dot-*`、状態の文字は `--state-*`。チャット・子チャット・サブエージェントで同じ変数を使い、`--ok` / `--ng` / `--warn` を状態の文に使わない。アクセントの色の文字は `--accent-fg`。
- 下線は使わない（押せる名前は `.link-button.hover-bg`、行・カードは `--bg-hover`、リンクは色だけ）。打ち消し線はよい。
- 回る印と跳ねる点は、どこでも `--dot-running`（押せるボタンの中だけはボタンの文字の色）。
- `:focus-visible` の規則の頭には `:where(:root:not([data-modality="pointer"]))` を付ける（`app/inputModality.ts`。マウスで操作している間は枠を出さない）。
- 定義していない CSS 変数を使わない。画面のコードが与える変数は `base/tokens.css` の末尾に書く。`getComputedStyle` で読まれる変数（Mermaid・ターミナル・エディタ）は、名前を変えたら読む側も直す。
- プロジェクトの札の色は `project/project-mark.css` 1 か所（`features/project/CLAUDE.md`）。

## 大きさと余白
<!-- 行き先: src/foundation/ui/styles/ -->
- `contain: strict` は大きさが外で決まる箱にだけ付ける（中身で高さが決まる箱は 0 に潰れる）。
- `content-visibility: auto` は、外へはみ出す飾りを持つ要素でなく内側の要素に当てる。`contain-intrinsic-size` は余白と枠を引いた中身の高さを書く。
- 欄の左右と、真ん中の画面の中身の枠のまわりは `--gutter` にそろえる（一部だけ狭く・広くしない）。プロジェクトの画面はタブで幅を変えない。
- 狭いときの並べ方は `@media` でなく `@container`（真ん中の幅はウィンドウより欄の幅で変わる）。
- 欄の開閉の動きは `--panel-motion-duration` / `--panel-motion-ease`。開閉で大きさが動く欄は、中身を開いたときの大きさのまま置いて切り取る。

### 角丸
- `base/tokens.css` の 3 段とピル・丸だけを使い、数を直に書かない: 小 `--radius-sm` = 押す物と行、中 `--radius` = 面、大 `--radius-lg` = 浮く窓と大きなアイコンのタイル、ピル `999px`・丸 `50%`（高さの半分を px で書かない）。
- 内側は外側より丸くしない（枠に沿わせる角は `calc(var(--radius) - 1px)`）。1〜5px の飾りと 16px 以下の小さな印だけは直に書いてよい。

## Electron のドラッグ領域
<!-- 行き先: src/foundation/ui/styles/ -->
- ドラッグ領域（`.page-header` `.sidebar-header`・欄のタブの列）の中で操作するものには `-webkit-app-region: no-drag`（ないと押してもドラッグになる。JS のクリックでは再現しないので計算後のスタイルで確かめる）。
- ドラッグ領域は `overflow: hidden` で切られない。閉じても大きさを残す欄は、閉じ終えたら `visibility: hidden`（開くときはすぐ見せる）。
- 入れ子の右の欄（`.agent-panel`）のタブの列はドラッグ領域にしない（外側の規則から `:not(:where(.agent-panel *))` で外す。`:where` がないと詳細度が上がる）。
- ドラッグ領域は後に書いた要素が勝つので、閉じたサイドバーの開くボタン・左上の画面移動・右上の開閉は DOM の最後に置く。全体表示中の見出し（`base/maximized-header.css`）はドラッグ領域より後、固定のボタンより前。
- 外側のクリックで閉じるものが開いている間は、`<html data-dismissable>` でドラッグ領域を止める（`base/layout.css`）。
- 左上の画面移動（`base/navigation.css`）はサイドバー・パネルの中に置かず固定し、空きは `.layout` の `--app-navigation-left` / `--app-titlebar-left-end` でそろえる。
