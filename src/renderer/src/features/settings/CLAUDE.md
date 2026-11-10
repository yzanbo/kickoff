# 設定・使用状況・下の帯・診断（`features/settings`・`features/usage`・`features/footer`・`features/diagnostics`）

## 設定のダイアログ（`SettingsDialog`）

- 左下の歯車・⌘, から開く `TabbedDialog`（画面は移らない）。項目（`SettingsSection`）: 使用状況・表示・サイドバー・接続・AI の既定・チャット・定型文・圧縮前・圧縮後指示・メモ・音声入力・通知・ターミナル・ブラウザの拡張機能・スマホ連携・診断。部品からその項目で開くときは `openSettings(section)`（App が受け取る。開いていればその項目に切り替える。チャット欄のマイクから「音声入力」など）。
- アプリの設定（`AppSettings`）は店（`settingsStore`）から読み、`useSettingsDraft` で下書きにして項目ごとに保存する（届いたら 1 回だけ下書きにし、ほかで設定が変わっても書いている途中の下書きは変えない。保存の応答は店に `set`）。保存のボタンと結果は `useSave` ＋ `SaveActions`。
- 表示（画面だけの表示の設定。保存は localStorage の設定）: テーマ（`THEME`。ダーク / ライト / システムに合わせる）・チャット欄（標準 / コンパクト `COMPOSER_COMPACT`。初めは標準）・会話の文字の大きさ（5 段階 `CHAT_FONT_SIZE`。初めは標準）・会話の横幅（`CHAT_WIDE`。初めは広げる）・チャットのタブの列（表示する / 隠す `CHAT_TAB_ROW_HIDDEN`）・チャットの見出し（表示する / 隠す `CHAT_HEADER_ROW_HIDDEN`）・見出しのバッジ（色付きで表示する / しない `CHAT_HEADER_BADGE_COLORS`。初めは色付き。グループ・作業場所のバッジ）・上に貼り付ける指示（表示する / 表示しない `STICKY_PROMPT_HIDDEN`。初めは表示する）・定型文の帯（表示する / 表示しない `SNIPPET_BAR_HIDDEN`。初めは表示する。`features/snippet` の `SnippetBarField`）・サブエージェントを開く場所（流れの中 / 右の欄 `SUBAGENT_OPEN_IN`。初めは流れの中）・プロジェクトの見出し（名前の行の出し方。表示 / 寄せたときだけ表示 / 非表示。`PROJECT_HEADER_MODE`。`features/project/CLAUDE.md`）・プロジェクトのタブ（`PROJECT_TABS_LAYOUT`）・チャットを開く場所（チャットタブ / ボードの右 `CHAT_PLACEMENT`。初めはチャットタブ。`features/project/page/chatPlacement.ts`）・下の帯（表示 / 寄せたときだけ表示 / 非表示 `FOOTER_MODE`。初めは表示）。どれもチャットの見出しの行・タブの右クリックなど、使う場所の切り替えと同じ設定。
- サイドバー: サイドバーの見出しのビューの一覧（並べ替え・名前と中身の変更・削除・新しいビュー。`features/sidebar` の `SidebarViewSettings`。説明は `features/sidebar/CLAUDE.md`）。
- 接続: AI エージェントと GitHub の CLI のログイン状態（`StatusCard` / `GitHubStatusCard`。`.card-grid`）。
- 対応予定の AI（まだ Kickoff のチャットで使えない Codex・Gemini。コアの `PlannedProvider`）は、出てくる所すべてで「対応予定」の札と、今後の対応予定であることの一言を添える（利用者の依頼）: 設定の「接続」（カードの札と説明の下の一言）・「使用状況」（見出しの札と「Kickoff のチャットで使えるようにするのは今後の対応予定（いまは使用状況を見られるだけ）」）・プロジェクトの設定の「AI」（カードの札とカードの下の一言）。どれが対応予定かと文言は `plannedProviders.ts` の `usePlannedProviders`（プロバイダーの `implemented` から決める。対応したら札も一言も消える）・`PLANNED_BADGE`。
- AI の既定: 新しいチャットのモデル・推論の深さ・権限モード・ファストモード（`AiDefaultsSettings`。選択肢の部品は `features/chat/options/AiOptions.tsx`）。
- チャット: 完了したチャットの自動のアーカイブ・自動圧縮を始める量（`auto_compact_pct`。コンテキストの 10〜90% / Claude Code の既定。コアが次のやり取りから Claude Code に渡す。チャット欄のメーターの詳細でも選べる）・通信が切れて止まったときの自動の再開・✕ を押したときの扱い（`CHAT_CLOSE_ACTION`）・ほかのチャットが作業中の作業場所で新しいチャットを始めるときの扱い（`BUSY_WORKPLACE_ACTION`。`features/worktree/busyWorkplace.ts`）。
- 定型文: 帯を表示するか（「表示」と同じ `SnippetBarField`）・すべてのプロジェクトの定型文（`features/snippet` の `SnippetSettings`。説明は `features/snippet/CLAUDE.md`）。
- 圧縮前・圧縮後指示: 共通の圧縮前指示・圧縮後指示（`features/snippet` の `CompactPromptSettings`。利用者の依頼で「定型文」から分けた）。
- メモ: メモの親フォルダ（`memos_dir`。`MemoSettings`。欄は `features/memo` の `MemoFolderField`）。
- 通知: チャットの完了・失敗・回答待ちの知らせ方（Mac の通知・ntfy）。「テスト通知を送る」（届かなければ理由を出す）と「Mac の通知の設定を開く」。知らせる中身は `app/notifications.ts` の `useChatNotifications`（Kickoff を見ていてそのチャットを開いているときは知らせない。押すとそのチャットを開く。スマホのブラウザではブラウザの通知）。
- ターミナル: 外部のターミナルとして開くアプリ（`useExternalTerminal`。`features/terminal/CLAUDE.md`）。ブラウザの拡張機能は `features/browser/BrowserExtensions`。
- 診断（`DiagnosticsSettings`）: 重いときに、再起動せずその場で性能の記録を取る（10 秒。アプリのメニューの「ヘルプ → 性能の記録を取る」と同じ）。押すと設定を閉じ、記録の間も操作を続けられる。保存先と最近の記録（新しい順）を、場所・コピー・Finder で開くの行 `features/diagnostics/DiagnosticsPath` で出す。記録の様子は画面の右下の `DiagnosticsIndicator`（ダイアログにしない）。

## 音声入力の設定（`VoiceSettings`）

使うか・方法（この Mac の whisper / OpenAI。`Segmented`）・言語・この Mac の準備（`StatusCard`）・モデルの一覧 `VoiceModelList`（使うものを選ぶ・ダウンロード・進み具合・削除。進み具合は店の `useVoiceStatus` がサーバーの知らせでその場で直す）・OpenAI のキー `OpenAiKeyField`（保存したら「保存済み」とだけ出し、二度と表示しない。ほかの設定とは別に、その場で保存する）・Base URL・モデル。チャット欄の入口は `features/chat/CLAUDE.md`。

## 使用状況（`features/usage`）

- プランの使用枠（5 時間・週）は店（`usageStore`）をアプリ全体で 1 つ共有する（`usePlanUsage` を App が持ち、下の帯 `AppFooter` に渡す。チャット欄のメーターの詳細には出さない）。名前の付け方・段階などは `usage.ts`（`usageWindowLabel`（モデル別の週枠は「週 · Fable」、下の帯の 1 行表示ではモデル名だけ）・`usageLevel`（70% から注意、90% から警告）・`planName` / `planLabel` / `accountLine` / `weeklyModel` / `usageUnavailableText`）。
- 使用率のバーは `UsageBar`（使用枠のメーター・チャット欄のコンテキストウィンドウで共通。数値のない枠は灰色）、使用枠のメーターは `UsageMeter`、何時時点かと最新の取得の失敗は `UsageFetchedNote`。
- 設定の「使用状況」（`UsagePanel`）はサービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）の枠。各サービスのログイン情報を読むだけなので、見られないサービスは理由と見る方法を出す（取るのはコア）。

## 下の帯（`features/footer/AppFooter`）

左に設定とサーバーとの接続（押すと上に詳細 `ConnectionPopover`）・本体のブランチ、Wi-Fi が切れたら「オフライン」（`useOnline`）。右に契約プランと使用状況（押すと右下から詳細 `UsagePopover`）。画面は移らない。出し方は `footerMode.ts`（`FOOTER_MODE`。表示 / 寄せたときだけ表示 / 非表示）で、帯の右クリックと設定の「表示」→「下の帯」で選ぶ。寄せたときだけ表示は、ふだんは下端の 4px だけを残して透明にし（縦の幅を取らない）、マウスを寄せると画面の上に重ねて出す（`.app-footer.auto-hide`。乗せている間・キーでピントを移している間・中の詳細を開いている間は出したまま）。非表示にしても設定は ⌘, で開ける。ターミナル（下のパネル）の開閉は右上の `LayoutToggles` に置き、下の帯には置かない。
