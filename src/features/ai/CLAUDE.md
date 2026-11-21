# AI のつなぎ込み（`src/features/ai`）

プロバイダー・ログイン・モデルと選択・使用状況。チャットの実行はプロバイダーの口だけを使い、各 AI の SDK・CLI を直接呼ばない。実装ごとの決まりは `core/providers/{claude,codex,copilot,acp}/CLAUDE.md`。

## 地図と境界

- 口は `core/providers/types.ts`（`AgentProvider`・`ProviderTurnParams`・`ProviderCallbacks`）。ほかの機能は `core/index.ts` からだけ読む（名前・要約の `askTitle`・`askSummary`、`UsageMonitor`）。
- 実装どうしは読まない（Cursor・Gemini は `acp/` の上に作る）。共有の小物は `core/providers/shared/`（止める・失敗の印・名乗り・環境変数・HTTP）。
- 外の SDK を読むのは 1 ファイルだけ（Claude は `claude/wire.ts`、Copilot は `copilot/sdk.ts`）。構造の検査（`ai-*` の決まり）が見る。

## 口の決まり

- 任意の機能（`models`・`fork`・`login`・会話記録の `sessions` など）は対応する AI だけが持つ。AI ごとの名前・CLI・色・できることは `@shared/ai/providers` の `PROVIDERS` 1 つ（AI の名前で if を書かず `providerCan`・`hasCapability`）。
- 失敗は投げずに `ProviderTurnResult` で返し、止められたら `cancelled`。記録の `user` / `approval` / `result` などはコアが作り、プロバイダーは出さない。
- AI を足すときは `providers/index.ts` の `createProviders` と `PROVIDERS`。確かめる前の AI は `KICKOFF_EXPERIMENTAL_PROVIDERS` のときだけ本物を使う（ほかは `planned.ts`）。
- チャットの AI は作るときに決め、途中では変えない。違う AI の子チャットは会話を引き継がない（セッションの形が違う）。
- API キーは `keys.ts` が `secrets` に暗号化して置き、応答・SSE に出さない。キーも MCP の鍵も起動の引数に載せず、環境変数は CLI が子プロセスから外せるものだけ。
- AI の操作ツールはプロバイダーが作らず、`params.tools` を各 CLI の MCP の書き方に直すだけ。記録の名前と入力の形は Claude Code にそろえる（`@shared/ai/claudeTools` の `toolUse`）。
- 守りはどの AI も `params.gate`（guard の門）に当てる。承認を聞いてくる CLI は `guard` → `byMode`（`permissionMode.ts`）、Claude はフック。

## チャットの AI の画面（`ui/provider/`）

- 選んだ AI は送るときの本文の `provider` で、送ったあとは変えない。選べない理由は `providerPickBlock`、決まりは `providerChoice.ts`。
- その AI にない機能は、`ChatProviderContext` の中の部品が `useFeatureBlock(機能)` で理由を読んで止める（文はコアと同じ `providerFeatureMissing`）。
- AI の状態は `useProviderStatus` の `load` だけが読み込む。モデルの一覧は `modelCatalog.ts`（一覧にないモデルを外す `knownModel`）。
- 前に出しているチャットの AI（`noteForegroundProvider`）は裏のタブで上書きしない。AI を替えたら、チャット欄の選択はコアが当て直した値に合わせ直す（`useChatOptions`）。

## 使用状況（`core/usage/`・`ui/usage/`）

- 形は `@shared/ai/usage` の `ProviderUsage`、見張りは `monitor.ts` の `UsageMonitor` 1 つ（支払いは `spending.ts`）。前の形の API・SSE は `usageCompat.ts`。
- 取り方は各 AI のフォルダの `usage.ts`。1 つが失敗・遅れても、ほかは出す。ログイン情報は読むだけで更新しない（更新するとその CLI のログインが切れる）。名乗りは `USER_AGENT`。
- 画面の使用枠の店は App が 1 つ持つ。残り時間を進める時計は `UsageMeter` に置く（App に置くと全体が描き直る）。超過分・クレジットの言葉は `@shared/ai/overage`。
