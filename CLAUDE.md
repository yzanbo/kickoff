# Kickoff の実装ルール

要件は `docs/requirements.md`、全体の構成と開発コマンドは `README.md` を見る。ここには「どう書くか」だけを書く。

## 全般

- コメントと画面の文言は日本語、変数名・関数名は英語。
- 書く前に、下の共有部品・hooks・補助関数で足りないか探す。同じ形を 2 か所目に書くことになったら、共有にしてから使う。
- 保存されている形式は変えない。localStorage のキー名と値（`"1"` / `"0"` など）はそのまま使い、DB のスキーマは `src/core/schema.ts` の `MIGRATIONS` に追記して変える（既存の要素は書き換えない）。
- 1 ファイルが 300 行を超えたら分割を考える。
- macOS のファイル名は大文字・小文字を区別しないので、部品（`FileTree.tsx`）と補助（`fileTree.ts`）のように、大文字・小文字だけが違う名前を付けない。

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
| 右クリック・「…」・＋のメニュー | `PopupMenu` ＋ `clampToViewport`。開いたら先頭にピントを置き ↑↓ で移るのは `useMenuKeys`。ボタンから開くメニューは `ignore` にボタンのセレクタを渡し、開いているときに押したら閉じる |
| 選択肢から 1 つ選ぶボタンの組 | `Segmented`（見た目は className で決める。数を出すなら選択肢の `badge`） |
| 名前で絞り込む検索欄 | `SearchField`。候補の ↑↓・Enter は `useListNavigation` |
| フォームの 1 行（名前・入力・補足） | `Field` |
| 保存ボタンと結果 | `useSave` ＋ `SaveActions`（結果の文だけなら `ResultMessage`） |
| 失敗の文 | `ErrorText`（空なら何も出さない） |
| モデル・推論の深さ・権限モードの選択肢 | `ModelOptions` / `EffortOptions` / `PermissionOptions` |
| 状態の点 | `StatusDot` ＋ `toneOf` |
| CLI の状態カード | `StatusCard` / `GitHubStatusCard`。カードとその並びは `.card` / `.card-grid` |
| サイドバーのチャットの並べ方 | まとめ方は `chatGroupings.ts` の `CHAT_GROUPINGS`（プロジェクト一覧の上の見出しの「チャット」の行の「まとめ方」「アーカイブ」「表示」から選ぶ。すべてのプロジェクトに効く: 新しい順・状態・作業場所（ブランチ）・セクションと、アーカイブ済みを出すか（`kickoff:sidebar-show-archived`）・1 行で出すか（`kickoff:sidebar-compact`。どのプロジェクトでも同じなので `useSharedFlag`）。上の行の「自分待ち」（`kickoff:sidebar-waiting-only`）は回答待ち・確認待ちのチャットとそのプロジェクトだけを出す（`sidebarFlags.ts` の `waitingRuns`。数はしまったプロジェクトを除く）。チャットの固定（`runs.pinned`、`togglePinRun`。並び順の時刻は変えない）は、プロジェクトのいちばん上の「固定」のまとまりに抜き出す（固定・アーカイブ済みのまとまりは `RowSection`）。行は ⌘ / Shift を押しながらのクリックで複数選べ（`chatSelection.ts`。サイドバー全体で 1 つ。範囲は画面の並び順で、横スライドの裏のプロジェクトは含めない）、選んでいる間は一覧の下の `SelectionBar` と右クリックのメニューでまとめてアーカイブ・グループへ移す・既読・削除（`runActions.ts` の `confirmArchiveRuns` など。断られたものは最後にまとめて知らせる）。Esc で選ぶのをやめる。サイドバーにピントがあるときは ↑↓ で行を移り（Shift で選ぶものに足す）、Enter で開く。⌘[ / ⌘] で前に開いたチャット・次のチャットへ（`useChatHistory`。コードの編集中は字下げに任せる）。行に乗せると右端に固定・アーカイブ・削除（`runActions.ts` の `toggleArchiveRun` / `confirmDeleteRun`。右クリックのメニューと共通。アーカイブはするときも戻すときも確かめる）。保存は `kickoff:sidebar-grouping` の `recent` / `status` をそのまま使い、`worktree` / `phase` を足した）。まとめた表示は `GroupedChatRows`（グループなしと、自分で作ったグループの中の両方をまとめる。まとまりごとに開閉し、`kickoff:sidebar-group-closed:<プロジェクト>:<並べ方>:<まとまり>` に覚える。検索中はすべて開く） |
| サイドバーの表示方法 | プロジェクト一覧の上の見出し `ProjectListHead`。何に効くかで 2 行に分ける（1 行目「プロジェクト」= 並べ方（縦 / 横スライド）・並び順（手動 / 最近動いた順）・アーカイブ（出すか）と、右端に縦並びのときの「すべて閉じる / 開く」（中のまとまりもすべて。`foldAll` で知らせ、各部品は `useFoldAll` で受け取る）/ 2 行目「チャット」= まとめ方・表示（1 行 / 2 行）・アーカイブ（出すか）。アーカイブはどちらの行も右端）。ボタンは設定の種類（ジャンル）ごとに分け、1 つのボタンには 1 種類だけを入れる（`HeadMenu`。2 段で、上に種類の名前・下にいまの値。幅は取りうる値 `values` のいちばん長いものに固定し、選び直しても変わらない）。種類の違う設定を 1 つのボタンにまとめない。狭いときは文字を隠して、いまの値を表すアイコンだけにする（@container）。下の行は主な操作だけ（縦並びは新しいプロジェクト、横スライドはプロジェクトの丸）で、表示方法の操作を足さない |
| サイドバーのグループの開閉 | `GroupToggle`。開閉の矢印は `Chevron` |
| ボードのスイムレーン | 表示の切り替えの 3 つ目（ボード / リスト / スイムレーン。`kickoff:board-view` / `kickoff:group-view` の `lanes`）。`BoardLanes`（列はどれも状態。カンバンの段の分け方: 作業場所（ブランチ）・セクション・グループ（プロジェクトのボード）・プロジェクト（全プロジェクトのボード）、`kickoff:board-lanes`。グループのタブは段 = グループで、列は下書き＋状態（`GroupLaneColumns`）。段へカードをドラッグするとグループを移す。段ごとに状態の列を並べ、見出しで開閉（`kickoff:board-lane-closed:`）） |
| ボードの列の見出し | `ColumnHead`（色の点・名前・件数・右端の操作）。完了の列には `ArchiveAllButton`（確かめてから、列のチャットをすべてアーカイブ） |
| ボードのカードの操作 | `runCardProps`（クリック・Enter で開く / 右クリックでメニュー / ドラッグはグループのボードだけ）。カンバンの列（作業中・回答待ち・確認待ち・完了）は AI の状態から `boardColumnOf` で決め、人は動かさない（DB の `runs.stage` は使わない）。まだ送っていない新しいチャット（右のパネル・プロジェクトのチャット欄で書いている途中）は、いちばん左の「下書き」の列に出す（チャット欄の分は `ProjectChatContext` から取る。書いている途中の文は `Composer` の `onTextChange` からタブの `draftText` に入れ、カードに初めの 3 行を出す）。新しいチャットは見出しの「新規」から始める。列の＋は、その列に意味があるとき（グループのボード）だけ置く |
| 画像を大きく見る | `ImageViewer`（アプリの中で開く。外のブラウザには Kickoff のログインがないので、添付を外で開かない。画像以外の添付はアプリの中でダウンロード）。画像以外を大きく見せるときは children、見出しのボタンは actions で渡す（Mermaid の図の全画面） |
| コードの色付け | `useHighlight`（行ごとの色。VS Code の Dark+ / Light+ でダーク・ライトに合わせる）＋ `CodeLine`（1 行を描く）。言語はファイル名から `languageOf`（`highlight.ts`）。色付けのライブラリ（Shiki）は使うときだけ読み込む |
| Markdown の表示 | `Markdown`（```mermaid は `MermaidDiagram` で図にする。生成中の返答には `streaming` を付け、書きかけの図を描かない） |
| プロジェクトのバッジ | `ProjectChip`（押してカンバンを開くなら `linked`、名前の代わりに選択欄などを置くなら children）。プロジェクトの並び順は `sidebarOrder`（上に固定したものが先、アーカイブしたものは出さない。アーカイブ済みは `archivedProjects`）。見出しのカード（`WorkspaceHead`）に常に出すのは、いつも使うもの（開閉（頭文字のボタン `.workspace-toggle`。乗せると矢印に変わる）・名前・状態ごとのチャット数 `HeadCounts`（作業中・回答待ち・確認待ち。色はカンバンの列と同じ）・＋・固定の印）だけ。固定のボタンはいつも出し、固定しているかは色と塗りで分ける。右クリックはプロジェクトに対する操作をまとまりに分けた `useProjectMenu`（このプロジェクト / 整理 / 編集・削除）。アーカイブするときも戻すときも確かめる（`confirmArchiveProject` / `confirmRestoreProject`）。すべてのプロジェクトに効く設定（チャットのまとめ方・アーカイブ済みを表示・1 行で表示）はプロジェクトのメニューに入れず、一覧の上の見出しの行 `ProjectListHead` に置く。操作を足すときは、まずこのメニューに入れ、常に出すかは別に考える。並び順は見出しの行の「並び順」で「最近動いた順」も選べる（`kickoff:sidebar-project-order`。そのときはドラッグで並べ替えない）。変更は `changeProject`。サイドバーにしまったものを出すかは `kickoff:sidebar-show-archived-projects`（初めは閉じる。見出しの「プロジェクト」の行の「アーカイブ」と、縦並びでは一覧の下の見出しで切り替える） |
| 画面の見出しの名前（プロジェクトの切り替え） | `ProjectSwitcher`（全プロジェクトの画面（サイドバーの「全プロジェクト」）は `project` なし。メニューの先頭で全プロジェクトに戻る。カンバンにプロジェクトの絞り込みは置かない） |
| ツールのまとまりの要約 | `summarizeTools`（「2個のファイルを編集 および 3個のコマンドを実行」） |
| 名前をその場で変える | `InlineName`（グループ名など）、チャット名は `useRunRename` ＋ `ChatTitleInput`（サイドバーの行はダブルクリックでも始める）。名前の変更にダイアログは使わない |
| ボードの見出し | `BoardHeader`。道具は概念ごとのまとまりに入れる（左: 主な操作（新規）→ 表示 → 整える（グループを作成） → 探す・絞り込む / 右: パネルの開閉。ブラウザ・ターミナルは見出しに置かず、パネルのタブの列の＋と、タブがないときのパネルの画面から開く） |
| プロジェクトのチャット欄 | 画面の右端の、どのタブでも開ける欄（`useProjectChat` ＋ `ProjectChat`。中身はボードの右のパネルと同じタブ（`SidePanel` の `sidebar`。チャット・ブラウザ・ターミナル）。App のレイアウトの 3 列目に置き、下のパネル（ターミナル）より下まで伸ばす。開閉は右上のレイアウトの開閉（`LayoutToggles`。左のサイドバー・下のパネル・チャット欄を VS Code と同じく並べる）か ⌥⌘B。開閉・表示中のチャットはプロジェクトごと、幅は `useDragWidth`（`side: "right"`））。ボードの右のパネル（カードを開く）とは別のもの |
| チャット欄の / と @ | `Composer` の `suggestTarget`（作業場所）を渡すと出る（`useSuggest` ＋ `SuggestList`、照らし合わせは `suggestMatch.ts`）。/ は文の先頭で、Claude Code のコマンド・スキル（コアの `GET /api/projects/:id/commands`。ターミナル専用は `TERMINAL_ONLY_COMMANDS` で除く）、@ は作業場所のファイル。↑↓・Enter / Tab・Esc |
| 埋め込みブラウザ | `BrowserPane`（`components/browser/`）。開発者ツールは `useDevtools`: 右・下はタブの中のもう 1 つの webview に、別のウィンドウはメインプロセスで作ったウィンドウに出す（`setDevToolsWebContents`。メインの `openDevToolsIn` / `openDevToolsWindow` / `closeDevTools`）。どこに出しているかは画面の側で持ち、Electron の devtools-opened / closed の知らせには頼らない（遅れて届く）。右と下の入れ替えは開き直さない。メニューで場所を選ぶと、その場所で開く |
| ターミナル | どの画面でも開ける下のパネル（`useBottomPanel` ＋ `BottomPanel`。⌃` / ⌘J で開閉、高さはドラッグ。ターミナルはプロジェクトごと（全プロジェクトの画面ではすべて）。開閉は右上の `LayoutToggles`（下の帯には置かない）。タブは ⌘\ で分割し、ペインは `TerminalSplit` で左右に並べる（⌥⌘← / → で移る））と、右のパネルのタブ（`openTerminal`）。開く場所は `terminalTargets`（チャットからは作業場所）。タブの見た目は `PanelTab`（右と下で共通）。表示は `TerminalPane`（xterm.js ＋ WebGL。使うときだけ読み込む）、シェルはメインプロセスの `terminals.ts`（node-pty。IPC だけでつなぎ、サーバーは通さない。裏の `@xterm/headless` に画面を写しておき、つなぎ直したら内容を返す）。⌘ のないキーはシェルのものなので、ターミナルの中ではアプリのショートカットに渡さない |
| 並行開発（ワークツリー） | チャットごとに作業場所（`runs.worktree_path`。空なら本体）を持ち、エージェントはその中で動く。新しいチャットで `WorkplacePicker`（本体・いまあるワークツリー・新しいワークツリー）、印は `WorktreeChip`（すべてのチャットに作業中のブランチを出す。ブランチはプロジェクトごとに 1 回だけ取る `useRunBranch`（`worktreeBranches.ts`）。ワークツリーは色付き、本体は控えめ）、ボードは作業場所で絞り込める。エディタタブは上の `WorktreePicker` で作業場所を切り替え、ワークツリーを選んでいるときは `WorktreeBar`（PR を作る・PR の状態・GitHub でマージされたら「片付ける」でワークツリーとブランチを消して本体をプル。PR は gh）。同じ作業場所で作業中のチャットは `useBusyNeighbors` で知らせる。チャットの作業場所とブランチの出し方は `workplace.ts` の `workplaceOf` に集める（ブランチの印・作業場所でまとめた見出し・段で共通。本体 / ワークツリー / フォルダなし（外で消された）/ 以前のブランチ（片付けて本体に戻った）。ブランチ名はいまの一覧 → チャットが最後に作業したブランチ `runs.branch`（送るたびに覚え、片付けても消さない）→ フォルダ名の順）。ワークツリーを作った・片付けた・消したら `invalidateWorktrees` で一覧を取り直す。コアで作業場所のフォルダを決めるのは `requireWorkdir`（フォルダが消えていれば 404）。ワークツリーを消す・片付けるときは、作業中なら止め、そこのチャットを本体に戻す（`clearRunWorktree`）。`WorktreeContext` ＋ `useGitTarget` で Git・ファイル・検索の操作先（`GitTarget`。API は `?worktree=`）を決める |
| Git の変更 | プロジェクトの「エディタ」タブ（`ChangesTab`。URL は `changes` のまま ＋ `useGitStatus`）。左端で「すべてのファイル」（`FileTree` ＋ `useProjectFiles`、木は `buildTree`、変更の色は `changeKinds`）・「検索」（`SearchView` ＋ `useProjectSearch`、印は `searchPattern` / `splitMatches`）・「履歴」（Fork と同じ形: 左にブランチ・ワークツリーなどの `HistorySidebar`（ワークツリーはリポジトリの隣の `<名前>-worktrees/` に作り、消すときは確かめる）、右上にコミットの表 `CommitTable`、右下に詳細 `CommitView`。`HistoryMain` が上下に分け、境目はドラッグで動かせる。読み込みは `useGitLog`、ブランチの線は `layoutGraph`（`commitGraph.ts`）、コミットの差分は `DiffView` の `commit`。日時は `formatDayTime`）・「変更」（`ChangeGroup`。一覧と木を切り替え、行の右にいつもステージ・ステージの取り消し・元に戻すのボタン（薄い色。乗せたボタンだけ濃くする）。元に戻すは確かめてから。上にコミットの欄 `CommitBox`（ステージしたものがなければ、すべてステージするか確かめる。進んでいればプッシュ、未公開ならブランチを公開）。操作は `useGitStatus` の `act` / `commit` / `push`）を切り替える。行の右の操作は `.row-actions`（FileTree の `actions`）。フォルダ・ファイルのアイコンは `FileIcon`（VS Code の Material Icon Theme。対応表は使うときだけ読み込む）。差分は `DiffView`（左右に並べる・1 列）、ファイルの中身は `FileView`。編集は `CodeEditor`（Monaco。「編集」を押したときだけ読み込む。入口は言語サービスを除いた `monacoEditor.ts`）で、保存は開いたときの指紋（`hash`）と比べ、ほかで変わっていれば上書きするか聞く。差分の行に分けるのは `parseDiff` / `toSplitRows`。Git の実行はコアの `gitOutput`（`git.ts`） |

## hooks と補助関数

- window のイベント: `useWindowEvent`（effect の中で `addEventListener` しない。ほかより先に受け取るなら `capture`）。サーバーのイベント: `useServerEvent`。
- いま画面に出ているテーマ（ダーク・ライト）: `useAppliedTheme`（`<html data-theme>` の変化で描き直す）。
- localStorage: `useStoredState` / `useStoredFlag` / `useStoredChoice` / `useStoredNumber` / `useStoredFlagMap`（部品から直接読み書きしない）。別々の部品から同じ値を切り替えるもの（サイドバーの各プロジェクトのメニューなど）は `useSharedFlag`（ほかの部品にもすぐ伝わる）。選択肢を増やすときも、今までの値はそのままの意味で読めるようにする（例: アーカイブの絞り込みは `"1"` / `"0"` のまま、`"archived"` を足した）。`useStoredFlagMap` の `set` は参照が変わらないので、memo した部品に渡せる。
- 右側のパネル（`useSidePanel`）の開閉と開いているタブは、`memoryKey` でボードごとに覚える（`panelMemory.ts`。タブやプロジェクトを切り替えて戻っても元どおり）。送る前の新しいチャット（下書き）は、すべてのボード・チャット欄の分をサイドバーの各プロジェクトの上にも出す（`DraftRows`。押すとそのパネルで開き、別の画面のものはその画面へ移ってから開く。`openDraft` / `discardDraft`）。
- 操作の失敗の表示: `useActionError`。時間とともに変わる表示: `useTicker`。つまみで幅・高さを変える: `startHorizontalDrag` / `startVerticalDrag`。左右の欄の境目は `useDragWidth`（幅を覚え、ダブルクリックで戻す。つまみは `.pane-resizer`）。アプリ全体で 1 回だけ取得: `cachedLoader`。
- 例外の文: `errorMessage`（`e instanceof Error ? e.message : String(e)` を書かない）。class 名の組み立て: `cx`。
- チャット名: `chatTitle`。時刻: `relativeTime` / `resetIn` / `formatClock`（`time.ts`）。トークン数: `formatTokens`。
- 使用枠: `planName` / `accountLine` / `usageLevel` / `weeklyModel` / `usageUnavailableText`（`usage.ts`）。設定の「使用状況」のサービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）はコアの `serviceUsage/`（1 サービス 1 ファイルの `UsageFetcher`。応答の変換は `parseXxx` に分けてテストする）。各サービスのログイン情報は読むだけで、更新・書き換えをしない（更新用のトークンを使うと、そのサービスの CLI のログインが切れる）。期限切れは、そのサービスを起動するよう案内する。モデルごとの選択肢: `effortsFor` / `permissionChoices` / `groupModels`（`models.ts`）。

## 表示の決まり

- 文言をそろえる: 名前のないチャットは「無題のチャット」、画面の読み込みは「読み込み中…」、使用枠の取得は「取得中…」、ログイン状態の確認は「確認中…」、保存は「保存中…」→「保存しました」。
- 失敗の文は 12px（`ErrorText`）。
- 状態の色: 使える = 緑 `--ok`、使えない = 赤 `--ng`、確認中 = 黄 `--warn`、対応予定 = 薄い灰 `--extra-muted`。
- 使用率の段階: 70% から注意、90% から警告（`usageLevel`）。数値がまだ届いていないときも 0% として出す。
- 未読は確認待ちの印（`attention`）。印の付け外しは `setRunAttention` で行い、最後に動いた時刻（一覧の並び順）を変えない。印を消すのは、パネルでそのチャットを表示したときと、見ている間に作業が終わったときだけ。
- 閉じるボタンのアイコンの大きさ: ポップオーバー 14、パネルと引き出し 15、ダイアログ 16。
- 操作は、基本的にいつも出すか、右クリックのメニューに入れる。マウスを乗せたときだけ出すのは、たくさん並ぶ一覧の行の操作で、いつも出すと一覧が埋まるときに限る（いまはサイドバーのチャットの行の固定・アーカイブ・削除）。そのときも同じ操作を右クリックのメニューに置く。サイドバーのプロジェクトのカードの頭文字は、乗せると開閉の矢印に変わる（押せば開閉する）。状態（固定しているかなど）は、出す・隠すで分けず、見た目（色・塗り）で分ける。
- アイコンだけの操作には必ず名前を付ける（`IconButton` の `label`）。選択肢の組は radiogroup / radio と aria-checked（`Segmented`）、開閉は aria-expanded と title。

## CSS（`styles.css` の 1 ファイル）

- 既存のクラスを使う。同じ宣言のブロックを増やさず、共通のクラスにまとめる（例: `.card`）。
- 同じ詳細度で後ろにあるルール（`.icon-button` など）に上書きされて効かない指定を書かない。足したら計算後のスタイルで確かめる。
- 使わなくなったクラスの CSS は消す。消すときは、名前を組み立てて付けるクラス（`sec-` `state-` `tone-` `status-` `meter-` `conn-` `task-status-` `priority-` `provider-` `drop-` `inspection-` `line-`、PR の状態の `open` / `merged` / `closed`）に気をつける。
- 新しいクラス名は、既存のものと重ならないか `styles.css` を検索してから付ける（タイムラインの `.diff-add` / `.diff-del`、全文検索の `.search-hit` は別の見た目なので、差分の表では `line-add`、ファイルの検索では `code-search-` を使う）。
- プロジェクトの画面はどのタブでも同じ横幅（`.page-wide` は上限なし）。タブで幅を変えない。
- 定義していない CSS 変数を使わない。
- 欄・パネルの開閉の動きは `--panel-motion-duration` / `--panel-motion-ease` にそろえる（左のサイドバー・ボードの右のパネル・右のチャット欄・下のパネル）。開閉で大きさが動く欄は、中身を開いたときの大きさのまま置いて切り取る（動いている間に中身を並べ直さない）。
- 欄の左右の余白は `--gutter`（12px）にそろえる（左のサイドバー・真ん中の画面・右のチャット欄・パネル）。個別の数値を書かない。
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
