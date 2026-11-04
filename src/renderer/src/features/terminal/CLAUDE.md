# ターミナル・埋め込みブラウザ・外のアプリで開く（`features/terminal`・`features/browser`・`features/openWith`）

どれもパネルのタブ（`features/panel/CLAUDE.md`）の中身か、タブの列から開くもの。メインプロセスの側（シェル・webview のセッション・開発者ツールのウィンドウ・外のアプリの開き方）は `src/main/CLAUDE.md`。

## ターミナル（`features/terminal`）

- 表示は `TerminalPane`（xterm.js ＋ WebGL。使うときだけ読み込む（`PanelTabPage` から lazy））。シェルはメインプロセスで動き、IPC だけでつなぐ（サーバーは通さない）。タブを裏に回しても・ボードを切り替えても・欄を閉じても動き続け、つなぎ直したらいまの画面の内容（`open` が返す snapshot）をもらって描き直す（つなぐまでに届いた出力は snapshot に含まれているので捨てる。画面に出したい注意も、別の出力として送らず snapshot に入れる）。配色は `terminalTheme`（16 色は VS Code の Dark+ / Light+、地と文字はアプリの色）、文字は `terminalFont`。⌘ を押しながらリンクを押すと、パネルのブラウザのタブで開く。
- ⌘ のないキー（⌃B・⌃K・Esc など）はシェルのものなので、ターミナルの中ではアプリのショートカットやパネルを閉じる Esc に渡さない。
- 開く場所は `terminalTargets`（プロジェクトのボードはそのプロジェクトの本体、全プロジェクトのボードは各プロジェクト。Mac のアプリでだけ）。チャットを表示しているペインから開くときは、そのチャットの作業場所で開く。いくつもあって決まらなければ `TerminalTargetMenu` で選ぶ。

## 埋め込みブラウザ（`features/browser`）

- `BrowserPane`（開発中のアプリのプレビュー・ドキュメント閲覧。デスクトップアプリでのみ動く）。ページは Kickoff 本体と切り離した専用のセッション（`partition="persist:kickoff-browser"`。メインプロセスでも強制）で開く。アドレス欄の文字は `lib/url.ts` の `normalizeUrl`（URL らしければそのまま、localhost などは http、ドメインは https、それ以外は検索）。アドレス欄の横の「〜で開く」は選んでいる外のブラウザで開く。
- 開発者ツールは `useDevtools`: 右・下はタブの中のもう 1 つの webview に、別のウィンドウはメインプロセスで作ったウィンドウに出す。どこに出しているかは画面の側で持ち、Electron の「開いた・閉じた」の知らせには頼らない（遅れて届く）。右と下の入れ替えは開き直さず、同じ入れ物の並べ方だけを変える。メニュー（`DockMenu`）で場所を選ぶと、その場所で開く。場所は `BROWSER_DEVTOOLS_DOCK`（初めは別のウィンドウ）、大きさは `BROWSER_DEVTOOLS_WIDTH` / `BROWSER_DEVTOOLS_HEIGHT`（`useDragSize`）。
- 拡張機能は設定の「ブラウザの拡張機能」（`BrowserExtensions`）。

## 外のアプリで開く（`features/openWith`）

- パネルのタブの列のブラウザ・ターミナルは、アイコンで新しいタブ、横の細い ▾ でメニュー `OpenWithMenu`（新しいタブで開く・区切り線・「外部で開く」の見出しの下にこの Mac に入っているアプリの一覧。アプリを押すとそのアプリでそのまま開き、次からの既定にもなる。チェックは最後に使ったアプリ）。アイコンと ▾ は 1 つのボタンに見せ、どちらに乗せても・メニューを開いている間も、2 つをつなげた 1 つの地で光らせる（`.panel-split-button` の `.panel-open-with`）。
- 開閉と開く場所は `useOpenWithMenu`（ブラウザは押したペインで表示中のブラウザのタブのページ（`browserPageOf`。なければアプリを開くだけ）、ターミナルはアイコン・タブがないときのボタン・▾ のどれも同じ決め方 `terminalTargetOf`（表示中のチャットの作業場所 → 開く場所が 1 つならそこ。決まらなければ `TerminalTargetMenu`））。
- 選んでいるアプリと入っているアプリの一覧は `externalApps.ts` の `useExternalTerminal` / `useExternalBrowser`（`EXTERNAL_TERMINAL` / `EXTERNAL_BROWSER`（初めは Chrome）。入っているアプリはアプリ全体で 1 回だけ調べる店。開けなければお知らせ）。アプリの一覧は `@shared/ipc` の `EXTERNAL_TERMINALS` / `EXTERNAL_BROWSERS`。チャットの見出しには外部のターミナルのボタンを置かない（パネルの ▾ に集める）。
