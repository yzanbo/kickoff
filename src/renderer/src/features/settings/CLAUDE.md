# 設定・使用状況・下の帯・診断（`features/settings`・`features/usage`・`features/footer`・`features/diagnostics`）

## 設定のダイアログ（`SettingsDialog`）

- 左下の歯車・⌘, から開く `TabbedDialog`（画面は移らない）。項目（`SettingsSection`）: 使用状況・表示・接続・AI の既定・チャット・音声入力・通知・ターミナル・ブラウザの拡張機能・スマホ連携・診断。部品からその項目で開くときは `openSettings(section)`（App が受け取る。開いていればその項目に切り替える。チャット欄のマイクから「音声入力」など）。
- アプリの設定（`AppSettings`）は店（`settingsStore`）から読み、`useSettingsDraft` で下書きにして項目ごとに保存する（届いたら 1 回だけ下書きにし、ほかで設定が変わっても書いている途中の下書きは変えない。保存の応答は店に `set`）。保存のボタンと結果は `useSave` ＋ `SaveActions`。
- 表示（画面だけの表示の設定。保存は localStorage の設定）: テーマ（`THEME`。ダーク / ライト / システムに合わせる）・チャット欄（標準 / コンパクト `COMPOSER_COMPACT`）・チャットの文の幅（`CHAT_WIDE`）・上に貼り付ける指示（表示する / 表示しない `STICKY_PROMPT_HIDDEN`）・サブエージェントを開く場所（流れの中 / 右の欄 `SUBAGENT_OPEN_IN`。初めは流れの中）・プロジェクトのタブ（`PROJECT_TABS_LAYOUT`）・ボードツールバーの置き方（`BOARD_HEADER_LAYOUT`）。どれもチャットの見出しの行・タブの右クリックなど、使う場所の切り替えと同じ設定。
- 接続: AI エージェントと GitHub の CLI のログイン状態（`StatusCard` / `GitHubStatusCard`。`.card-grid`）。
- AI の既定: 新しいチャットのモデル・推論の深さ・権限モード・ファストモード（`AiDefaultsSettings`。選択肢の部品は `features/chat/options/AiOptions.tsx`）。
- チャット: 完了したチャットの自動のアーカイブ・通信が切れて止まったときの自動の再開・✕ を押したときの扱い（`CHAT_CLOSE_ACTION`）。
- 通知: チャットの完了・失敗・回答待ちの知らせ方（Mac の通知・ntfy）。「テスト通知を送る」（届かなければ理由を出す）と「Mac の通知の設定を開く」。知らせる中身は `app/notifications.ts` の `useChatNotifications`（Kickoff を見ていてそのチャットを開いているときは知らせない。押すとそのチャットを開く。スマホのブラウザではブラウザの通知）。
- ターミナル: 外部のターミナルとして開くアプリ（`useExternalTerminal`。`features/terminal/CLAUDE.md`）。ブラウザの拡張機能は `features/browser/BrowserExtensions`。
- 診断（`DiagnosticsSettings`）: 重いときに、再起動せずその場で性能の記録を取る（10 秒。アプリのメニューの「ヘルプ → 性能の記録を取る」と同じ）。押すと設定を閉じ、記録の間も操作を続けられる。保存先と最近の記録（新しい順）を、場所・コピー・Finder で開くの行 `features/diagnostics/DiagnosticsPath` で出す。記録の様子は画面の右下の `DiagnosticsIndicator`（ダイアログにしない）。

## 音声入力の設定（`VoiceSettings`）

使うか・方法（この Mac の whisper / OpenAI。`Segmented`）・言語・この Mac の準備（`StatusCard`）・モデルの一覧 `VoiceModelList`（使うものを選ぶ・ダウンロード・進み具合・削除。進み具合は店の `useVoiceStatus` がサーバーの知らせでその場で直す）・OpenAI のキー `OpenAiKeyField`（保存したら「保存済み」とだけ出し、二度と表示しない。ほかの設定とは別に、その場で保存する）・Base URL・モデル。チャット欄の入口は `features/chat/CLAUDE.md`。

## 使用状況（`features/usage`）

- プランの使用枠（5 時間・週）は店（`usageStore`）をアプリ全体で 1 つ共有する（`usePlanUsage` を App が持ち、`PlanUsageContext` / `useSharedPlanUsage` で配る）。名前の付け方・段階などは `usage.ts`（`usageWindowLabel`（モデル別の週枠は「週 · Fable」、下の帯の 1 行表示ではモデル名だけ）・`usageLevel`（70% から注意、90% から警告）・`planName` / `planLabel` / `accountLine` / `weeklyModel` / `usageUnavailableText`）。
- 使用率のバーは `UsageBar`（使用枠のメーター・チャット欄のコンテキストウィンドウで共通。数値のない枠は灰色）、使用枠のメーターは `UsageMeter`、何時時点かと最新の取得の失敗は `UsageFetchedNote`。
- 設定の「使用状況」（`UsagePanel`）はサービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）の枠。各サービスのログイン情報を読むだけなので、見られないサービスは理由と見る方法を出す（取るのはコア）。

## 下の帯（`features/footer/AppFooter`）

左に設定とサーバーとの接続（押すと上に詳細 `ConnectionPopover`）・本体のブランチ、Wi-Fi が切れたら「オフライン」（`useOnline`）。右に契約プランと使用状況（押すと右下から詳細 `UsagePopover`）。画面は移らない。ターミナル（下のパネル）の開閉は右上の `LayoutToggles` に置き、下の帯には置かない。
