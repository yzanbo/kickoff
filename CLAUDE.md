# Kickoff の実装ルール

要件は `docs/requirements.md`、全体の構成と開発コマンドは `README.md` を見る。ここには「どう書くか」だけを書く。

## 全般

- コメントと画面の文言は日本語、変数名・関数名は英語。
- 書く前に、下の共有部品・hooks・補助関数で足りないか探す。同じ形を 2 か所目に書くことになったら、共有にしてから使う。
- 保存されている形式は変えない。localStorage のキー名と値（`"1"` / `"0"` など）はそのまま使い、DB のスキーマは `src/core/schema.ts` の `MIGRATIONS` に追記して変える（既存の要素は書き換えない）。
- 1 ファイルが 300 行を超えたら分割を考える。

## 置き場所と分け方

### 画面（`src/renderer/src`）

- 複数のファイルになる機能は `components/<機能>/` にまとめる（`board/` `sidebar/` `sidePanel/` `newProject/` `projectSettings/` `settings/`）。
- 汎用の hooks は `hooks/`。小さな共有の補助は直下のモジュール（`cx.ts` `errors.ts` `time.ts` `format.ts` `chatTitle.ts` `cachedLoader.ts` `models.ts` `usage.ts` `groups.ts` `projectOrder.ts` `theme.ts` など）。
- 大きな部品は「状態と操作の hook（`useXxx`）」と「表示の部品」に分ける（例: `useSidePanel` ＋ `SidePanel` / `PanelToggle` / `DraftCards`、`useSidebar` ＋ `Sidebar`）。要素に渡す props の束も hook から返してよい（`panel.body`、`sidebar.layout`）。
- 画面（ルート）を増やす前に、ダイアログや右のパネルで足りないか考える（設定は左下の歯車・⌘, から開くダイアログ）。
- チャットに付いている情報（サブエージェントなど）は、チャット欄のすぐ上のピルの列（`.composer-chips`）に並べる。

### コア（`src/core`）

- HTTP のルートは `routes/<機能>.ts` に `xxxRoutes(app, deps)` として書き、`server.ts` で登録する。登録の順は、認証のミドルウェアより後・画面の配信より前で、既存の順を崩さない。
- 見つからないときの 404 は `routes/http.ts` の `requireProject` などを使う。入力は zod で検証し、失敗の 400 は `onError` に任せる。
- Claude のプロバイダーは役割ごとに分けてある: 実行ファイルと環境変数 `claudeEnv`、権限と書き込み範囲 `claudePolicy`、SDK のメッセージの変換 `claudeMessages`、使用枠 `claudeUsage`。
- 例外の文は `src/core/errors.ts` の `errorMessage`。

## 画面の共有部品（手書きしない）

| 用途 | 使うもの |
|---|---|
| アイコンだけのボタン | `IconButton` / `CloseButton` / `RefreshButton`（`label` が aria-label と title になる。`<button className="icon-button">` を手で書かない） |
| モーダル | `useModalDialog`（入力中に閉じたくないフォームは `closeOnBackdrop: false`） |
| 左に項目・右に内容のダイアログ | `TabbedDialog`（プロジェクトの編集・設定） |
| 確認・入力・お知らせのダイアログ | `confirmDialog` / `promptDialog` / `alertDialog`（`dialogs.tsx`） |
| ポップオーバー | `PopoverHeader`。外側クリックと Esc で閉じるのは `useDismiss`（`escape`: `stop` = いちばん上だけ閉じる / `pass` = ほかの Esc にも伝える / `none`） |
| 右クリック・「…」・＋のメニュー | `PopupMenu` ＋ `clampToViewport`。開いたら先頭にピントを置き ↑↓ で移るのは `useMenuKeys` |
| 選択肢から 1 つ選ぶボタンの組 | `Segmented`（見た目は className で決める） |
| 名前で絞り込む検索欄 | `SearchField`。候補の ↑↓・Enter は `useListNavigation` |
| フォームの 1 行（名前・入力・補足） | `Field` |
| 保存ボタンと結果 | `useSave` ＋ `SaveActions`（結果の文だけなら `ResultMessage`） |
| 失敗の文 | `ErrorText`（空なら何も出さない） |
| モデル・推論の深さ・権限モードの選択肢 | `ModelOptions` / `EffortOptions` / `PermissionOptions` |
| 状態の点 | `StatusDot` ＋ `toneOf` |
| CLI の状態カード | `StatusCard` / `GitHubStatusCard`。カードとその並びは `.card` / `.card-grid` |
| サイドバーのグループの開閉 | `GroupToggle`。開閉の矢印は `Chevron` |
| ボードのカードの操作 | `runCardProps`（クリック・Enter で開く / 右クリックでメニュー / ドラッグ） |
| 画像を大きく見る | `ImageViewer`（アプリの中で開く。外のブラウザには Kickoff のログインがないので、添付を外で開かない。画像以外の添付はアプリの中でダウンロード）。画像以外を大きく見せるときは children、見出しのボタンは actions で渡す（Mermaid の図の全画面） |
| Markdown の表示 | `Markdown`（```mermaid は `MermaidDiagram` で図にする。生成中の返答には `streaming` を付け、書きかけの図を描かない） |
| プロジェクトのバッジ | `ProjectChip`（押してカンバンを開くなら `linked`、名前の代わりに選択欄などを置くなら children）。プロジェクトの並び順は `sidebarOrder` |
| ツールのまとまりの要約 | `summarizeTools`（「2個のファイルを編集 および 3個のコマンドを実行」） |
| 名前をその場で変える | `InlineName`（グループ名など）、チャット名は `useRunRename` ＋ `ChatTitleInput`。名前の変更にダイアログは使わない |
| ボードの見出し | `BoardHeader`。道具は概念ごとのまとまりに入れる（左: 表示 → 探す・絞り込む / 右: 作る・開く → パネルの開閉） |

## hooks と補助関数

- window のイベント: `useWindowEvent`（effect の中で `addEventListener` しない。ほかより先に受け取るなら `capture`）。サーバーのイベント: `useServerEvent`。
- いま画面に出ているテーマ（ダーク・ライト）: `useAppliedTheme`（`<html data-theme>` の変化で描き直す）。
- localStorage: `useStoredState` / `useStoredFlag` / `useStoredChoice` / `useStoredNumber` / `useStoredFlagMap`（部品から直接読み書きしない）。選択肢を増やすときも、今までの値はそのままの意味で読めるようにする（例: アーカイブの絞り込みは `"1"` / `"0"` のまま、`"archived"` を足した）。`useStoredFlagMap` の `set` は参照が変わらないので、memo した部品に渡せる。
- 右側のパネル（`useSidePanel`）の開閉と開いているタブは、`memoryKey` でボードごとに覚える（タブやプロジェクトを切り替えて戻っても元どおり）。
- 操作の失敗の表示: `useActionError`。時間とともに変わる表示: `useTicker`。つまみで幅を変える: `startHorizontalDrag`。アプリ全体で 1 回だけ取得: `cachedLoader`。
- 例外の文: `errorMessage`（`e instanceof Error ? e.message : String(e)` を書かない）。class 名の組み立て: `cx`。
- チャット名: `chatTitle`。時刻: `relativeTime` / `resetIn` / `formatClock`（`time.ts`）。トークン数: `formatTokens`。
- 使用枠: `planName` / `accountLine` / `usageLevel` / `weeklyModel` / `usageUnavailableText`（`usage.ts`）。モデルごとの選択肢: `effortsFor` / `permissionChoices` / `groupModels`（`models.ts`）。

## 表示の決まり

- 文言をそろえる: 名前のないチャットは「無題のチャット」、画面の読み込みは「読み込み中…」、使用枠の取得は「取得中…」、ログイン状態の確認は「確認中…」、保存は「保存中…」→「保存しました」。
- 失敗の文は 12px（`ErrorText`）。
- 状態の色: 使える = 緑 `--ok`、使えない = 赤 `--ng`、確認中 = 黄 `--warn`、対応予定 = 薄い灰 `--extra-muted`。
- 使用率の段階: 70% から注意、90% から警告（`usageLevel`）。数値がまだ届いていないときも 0% として出す。
- 未読は確認待ちの印（`attention`）。印の付け外しは `setRunAttention` で行い、最後に動いた時刻（一覧の並び順）を変えない。印を消すのは、パネルでそのチャットを表示したときと、見ている間に作業が終わったときだけ。
- 閉じるボタンのアイコンの大きさ: ポップオーバー 14、パネルと引き出し 15、ダイアログ 16。
- アイコンだけの操作には必ず名前を付ける（`IconButton` の `label`）。選択肢の組は radiogroup / radio と aria-checked（`Segmented`）、開閉は aria-expanded と title。

## CSS（`styles.css` の 1 ファイル）

- 既存のクラスを使う。同じ宣言のブロックを増やさず、共通のクラスにまとめる（例: `.card`）。
- 同じ詳細度で後ろにあるルール（`.icon-button` など）に上書きされて効かない指定を書かない。足したら計算後のスタイルで確かめる。
- 使わなくなったクラスの CSS は消す。消すときは、名前を組み立てて付けるクラス（`sec-` `state-` `tone-` `status-` `meter-` `conn-` `task-status-` `priority-` `provider-` `drop-` `inspection-`）に気をつける。
- 定義していない CSS 変数を使わない。
- Electron のドラッグ領域は後に書いた要素が優先されるので、閉じたサイドバーの「開く」ボタンは DOM のいちばん後ろに置く。
- ドラッグ領域（`.run-header` `.page-header` `.sidebar-header`）の中で操作するもの（ボタン・リンク・入力欄・選択欄）には `-webkit-app-region: no-drag` を付ける。付けないと、押してもウィンドウのドラッグになって効かない（JS のクリックでは再現しないので、計算後のスタイルで確かめる）。
- ピルの中に置く選択欄は `.pill-select`（枠と背景はピルに任せる）。

## Electron とサーバー

- 終了時の片付けは `before-quit` で `preventDefault` → 片付け → `app.exit(0)`。`app.quit()` を呼び直さない（ウィンドウだけ閉じてアプリが残る）。片付けは 5 秒で打ち切る。
- HTTP サーバーは `stopHttpServer` で止める（開いたままの SSE の接続も切る）。
- SSE は、つないだらすぐ最初の行を送る（書くまで応答ヘッダーが届かない）。切断の知らせ（`onAbort`）は最初の `await` より前に登録する。

## 確かめ方

- 型は `npx tsc --noEmit --noUnusedLocals`（使っていない import と変数も残さない）、テストは `npm test`。
- API のルートを変えたら `src/core/server.test.ts` にテストを足す。
- 画面の変更は、開発アプリ（`KICKOFF_REMOTE_DEBUG=9333 npm run dev`。CDP のポートは 9333）で実際に動かして確かめる。見た目を変えないはずの変更は、変更の前後で DOM と計算後のスタイルを比べる。
- core や main を変えたあとに開発アプリを再起動するときは、Electron のメインプロセスにだけ `kill -TERM` を送る（pkill でまとめて止めると、ディスクに書かれていない localStorage が消える）。その前に `/api/status` で実行中のチャットがないことを確かめる。
- 利用者の localStorage を書き換えて確かめたら、元の値に戻す。
- コミットは区切りごとに、日本語で「種類: 内容」（`feat` / `fix` / `refactor` / `test`）。
