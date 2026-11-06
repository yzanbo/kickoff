# CSS（`src/renderer/src/styles`）の決まり

機能ごとのファイルを、`index.css` の `@import` の順（＝カスケードの順）で 1 つにつなぐ。中身は領域ごとのサブフォルダ（`base/` `ui/` `sidebar/` `chatList/` `project/` `palette/` `chat/` `footer/` `board/` `panel/` `browser/` `editor/` `terminal/`）。

## ファイルと順

- `index.css` には `@import` 以外を書かない。1 ファイル 300 行以内。
- 順（いまの `index.css`。変えるときはカスケードの勝ち負けが変わることに気をつける）:
  `base/tokens`（変数。末尾に、画面のコードが inline style / `setProperty` で与える変数の一覧）→ `base/base`（body と `.muted` `.small` `.error` などの小さな共有クラス。後ろの部品に負ける前提で先頭側）→ `base/layout`（全体の並び・ドラッグ領域・`.pane-resizer`）→ `ui/popover`（`Popover`）→ `sidebar/`（`sidebar` 枠・上のメニュー行 → `sidebar-rows` チャットの行・選択バー → `sidebar-search` 検索欄・行の状態の印 → `sidebar-groups` 自分で作ったグループ → `sidebar-sections` まとまりの見出し・`Collapse` → `sidebar-projects` プロジェクトのカード → `sidebar-head` `ProjectListHead` → `sidebar-list` 縦並び・並べ替え・横スライドの丸 → `sidebar-counts` `HeadCounts`）→ `ui/status`（状態の印・角の数 `.corner-count`）→ `chatList/state-chats`（`StateChatsPopover`）→ `ui/inline-name`（`InlineName`。`.icon-button` より前）→ `ui/buttons-forms`（`.btn` `.icon-button` `.link-button`・`InlineName`・入力欄）→ `project/project-tags`（タグ。サイドバーとダイアログで使うので `.icon-button` より後ろの共有の位置）→ `project/project-mark`（印と札の地）→ `ui/dialogs`（共通の枠・`TabbedDialog`）→ `project/project-edit` → `ui/app-dialogs`（確認・入力・選択）→ `project/new-project` → `palette/palette` → `palette/search` → `project/project-page`（枠・見出し・タブの行）→ `project/project-tabs` → `ui/cards`（`.card` `.card-grid`・状態カード）→ `ui/empty-state`（`EmptyState`）→ `chat/`（`chat` 見出し・流れ → `chat-tools` → `bash-output`（コマンドの呼び出しのコマンドと出力の欄）→ `tool-status`（ツールの状態のアイコン）→ `command-live`（実行中のコマンドの出力）→ `messages` → `sticky-prompt`（上に貼り付ける指示の帯）→ `chat-find` → `selection-attach` → `scroll-bottom` → `new-chat` → `composer`（末尾に右下の操作の並び `.composer-actions`）→ `queue-mode` → `dictation` → `snippets`（チャット欄の上の定型文の帯と一覧）→ `snippet-manager`（定型文の管理のダイアログ・設定の一覧とフォーム）→ `queued` → `queued-head` → `queued-attachments` → `composer-select` → `subagents` → `todo`（チャット欄の上の ToDo のピルと一覧）→ `subagent-card`（流れの中のサブエージェントのカード・裏の作業の一覧）→ `subagent-window`（サブエージェントの色・メインからの枝分かれの線・カードの手順の窓）→ `subagent-screen`（右の欄のサブエージェントの画面と色で染めた見出し・タブの状態のアイコン・動きの行の 2 つのボタン）→ `subagent-badges`（カードと画面の見出しの「サブエージェント」の札・入れ子の「↳」・中のサブエージェントの札と、閉じたカードの下の木の枝の行・「右の欄で表示中」・狭い見出しで名前を残して札を隠す順）→ `subagent-tell`（カードの「伝える」の入力欄）→ `activity`（動き・見出しの「会話 / 動き」）→ `activity-rails`（動きの行の並びと左の線）→ `context-meter` → `attachments`）→ `ui/image-viewer` → `chat/approval` → `chat/question-card` → `ui/markdown` → `footer/`（`usage-meter` → `footer` → `diagnostics`）→ `base/mobile` → `board/`（`board` → `board-header` → `board-columns` → `board-cards`）→ `panel/`（`side-panel` → `side-panel-tabs` → `side-panel-tab-groups` → `side-panel-tab-kinds`（色のあるタブ: まとまりの中のタブと右の欄のメモ・サブ・子のタブの色 `--tab-color`（表示中のタブの下線に使う）と種類の札）→ `side-panel-split` → `chats-tab`（チャットをボードと分けた「チャット」タブ））→ `browser/browser` → `board/board-list`（拡張機能の一覧・リスト表示）→ `ui/menu`（`PopupMenu` の中身）→ `base/scrollbar` → `base/focus` → `editor/`（`editor` → `editor-explorer` → `editor-changes` → `editor-history` → `editor-history-sidebar` → `editor-chips`（作業場所の行・ブランチの印・PR）→ `editor-side`（チャットの画面の右の欄の変更とファイル）→ `memo`（プロジェクトの「メモ」タブ・設定のメモのフォルダの欄・チャットの「メモに追加」のメニューと知らせ）→ `memo-editor`（メモの編集の部品と HTML のメモのページ `.memo-html-page`）→ `memo-ai`（メモの AI のフォルダの整理案のダイアログ）→ `memo-chat`（本文の右のメモのチャットの欄（開閉のスライド・幅）。狭ければ本文の下）→ `memo-quick-chat`（メモの下の AI に直してもらう入力欄））→ `terminal/terminal` → `panel/bottom-panel` → `panel/project-chat` → `panel/agent-panel`（チャットの画面の右の欄。メインとの並べ方・覆う・幅のつまみ・欄の色 `--agents-tone` と「サブエージェント」の札）→ `ui/color-swatch`。

## 置き場所

- 規則はその機能のファイルに書く（部品が `features/<領域>/` にあるなら、同じ領域のサブフォルダ）。複数の画面で使う部品は `ui/buttons-forms.css` か `ui/menu.css`（`InlineName` は `ui/inline-name.css`）。
- 新しいファイルは `index.css` の該当する位置に `@import` を足す（`base/base` より後ろ、汎用の部品はそれを使う画面より前）。
- 基底を上書きする `@media` / `@container` は、その基底と同じファイルの基底より後ろに置く（`base/mobile.css` には、後ろのファイルの基底に負けるものを置かない）。

## 書き方

- 既存のクラスを使う。同じ宣言のブロックを増やさず、共通のクラスにまとめる（例: `.card`）。ただし、1 行で省略する 3 点セット（`overflow: hidden` `text-overflow: ellipsis` `white-space: nowrap`）は CSS の定型句なので、共通クラスにせず各規則に書いてよい（共通クラスを `base/base.css` に置くと、間の規則との勝ち負けが変わる）。
- 同じ詳細度で後ろにあるルール（`.icon-button` など）に上書きされて効かない指定を書かない。足したら計算後のスタイルで確かめる。
- ボタンは、ブラウザの既定の余白（`padding: 1px 6px`）・行の高さ・文字の大きさを持っている。大きさを決めたボタン（アイコンだけ・丸・ピルの中の小さな ×・▾ など）には必ず `padding: 0` を書き、中身は `display: grid; place-items: center`（文字と並べるなら `inline-flex; align-items: center; justify-content: center`）で真ん中に置く。余白を残すと、幅を狭めたときに中身の幅がアイコンより狭くなり、アイコンが右へはみ出して真ん中からずれる。`margin` の負の値や `top` で見た目だけ合わせない。アイコンだけのボタンは `IconButton` を使えばこの形になる（`.icon-button` は `display: inline-grid; place-items: center; padding: 0`）。大きさを変えるときは className で `width` / `height` だけを上書きし、真ん中寄せは崩さない。
- 2 つのボタンを 1 つに見せる組（アイコン ＋ ▾ など）は、乗せたときの地を外側の入れ物に付け、中の各ボタンの地は透明にする（それぞれに地を付けると、別々に光って 2 つのボタンに見える。`.panel-split-button`）。
- 使わなくなったクラスの CSS は消す。消すときは、名前を組み立てて付けるクラスに気をつける（いまの頭: `state-` `status-` `tone-` `meter-` `conn-` `drop-` `line-` `dock-` `held-` `todo-` `inspection-` `provider-` `head-menu-` `head-count-`、PR の状態の `open` / `merged` / `closed`（`.pr-chip`）、一番下へ戻るボタンの状態 `waiting` / `arrived` / `working` / `idle` / `failed` / `offline`）。
- 新しいクラス名は、既存のものと重ならないか `styles/` 全体と、組み立てて付けるクラス（サイドバーの並べ方 `stack` / `slide` / `rail` など）を検索してから付ける。1 語の名前は避け、領域の頭を付ける（動きの線を `.rail` にして、サイドバーの縦スライドの `.workspaces.rail` に当たり、一覧がつぶれた）（タイムラインの `.diff-add` / `.diff-del`、全文検索の `.search-hit` は別の見た目なので、差分の表では `line-add`、ファイルの検索では `code-search-` を使う）。
- アクセントの色の文字（オンになっている切り替えなど）は `--accent-fg`（ダークは `--accent-bright`、ライトは地に負けない `--accent`）。
- 下線は使わない（押せることを下線で示さない。文の中の押せる名前に乗せたときは背景のハイライト `.link-button.hover-bg`（`ui/buttons-forms.css`）、行・カードの見出しは地の色 `--bg-hover`。リンクは色だけ）。打ち消し線（完了した ToDo・消したファイル）は下線ではないので使ってよい。コードの色付けのテーマが付ける下線（`CodeLine`）はそのまま。
- 回る印（`.spinner`・`.status-ring`・サブエージェントの印・圧縮中のメーターの弧）と作業中の跳ねる点（`.dots`）は、どこでも作業中の色 `--dot-running` にする（場所ごとに色を変えない）。押せるボタンの中の印（止めている途中の送信ボタン・更新のアイコン）だけは、ボタンの文字の色に合わせる。
- 定義していない CSS 変数を使わない。画面のコードが与える変数は `base/tokens.css` の末尾の一覧に書き、使う側は必要なら `var(--x, 既定値)` で受ける。`getComputedStyle` で読まれている変数（Mermaid の配色・ターミナル・エディタ）は、名前を変えるときに読む側も直す。
- プロジェクトの名前の札の地と枠の色は `project/project-mark.css` に 1 か所で持つ（`features/project/CLAUDE.md`）。

## 大きさと余白

- 欄の左右の余白は `--gutter`（8px）にそろえる（左のサイドバー・真ん中の画面・右のチャット欄・パネル）。個別の数値を書かない。
- プロジェクトの画面はどのタブでも同じ横幅（`.page-wide` は上限なし）。タブで幅を変えない。
- 真ん中の画面の幅は、ウィンドウより欄の幅（右のチャット欄・ボードの右のパネル）で変わる。狭いときの並べ方は `@media` ではなく `@container` で書く（ボードのツールバーは `.board` の幅、列は `board-main` の幅。チャットの見出しの検索欄も `@container`）。
- 欄・パネルの開閉の動きは `--panel-motion-duration` / `--panel-motion-ease` にそろえる（左のサイドバー・ボードの右のパネル・右のチャット欄・下のパネル）。開閉で大きさが動く欄は、中身を開いたときの大きさのまま置いて切り取る（動いている間に中身を並べ直さない）。ボードの右のパネルの決まりは `features/panel/CLAUDE.md`。

## Electron のドラッグ領域

- ドラッグ領域（`.page-header` `.sidebar-header`・チャット欄 / 下のパネルのタブの列 `.board-panel.as-sidebar .panel-tabs`）の中で操作するもの（ボタン・リンク・入力欄・選択欄）には `-webkit-app-region: no-drag` を付ける。付けないと、押してもウィンドウのドラッグになって効かない（JS のクリックでは再現しないので、計算後のスタイルで確かめる）。
- ドラッグ領域は、見た目の切り取り（`overflow: hidden`）では切り取られない。閉じても中身を開いたときの大きさのまま残す欄（右端のチャット欄・下のパネル）は、閉じ終えたら `visibility: hidden` にする（閉じる動きのあとに切り替え、開くときはすぐ見せる）。以前は、閉じたチャット欄の中身が見えないままボードの上にはみ出し、そのタブの列（ドラッグ領域）がボードの右のパネルのタブ・見出しのボタンに重なって、押してもウィンドウのドラッグになり、カーソルも矢印になった（そこでは画面にマウスの動きもクリックも届かない）。
- チャットのタブの中に入れ子で置く右の欄（`.agent-panel`。サブエージェントの欄）のタブの列は、ウィンドウのドラッグ領域にしない。外側の欄（チャット欄・フッター）のタブの列の規則（`.board-panel.as-sidebar .panel-tabs` など。ドラッグ領域・2 段・右上の空き）は子孫に効くので、`:not(:where(.agent-panel *))` で内側を外す（`:where` なので詳細度は変わらない。`:not(.agent-panel *)` と書くと詳細度が上がり、フッターの規則に勝ってしまう）。右の欄の根は `.board-panel` ではなく `.agent-panel`（`SURFACES.agents.rootClass`）にして、外側のパネルの幅・開閉の規則も効かせない。
- ドラッグ領域は後に書いた要素が優先されるので、閉じたサイドバーの「開く」ボタン・右上のレイアウトの開閉は DOM のいちばん後ろに置く。
- 外側のクリックで閉じるもの（ポップオーバー・メニュー）が開いている間は、`<html data-dismissable>` でドラッグ領域を止める（`base/layout.css`。ドラッグ領域を押すとページにクリックが届かず、閉じなかったため）。
- ピルの中に置く選択欄は `.pill-select`（枠と背景はピルに任せる）。
