# AI のつなぎ込み（`src/features/ai`）

プロバイダー・ログイン・モデルと選択・使用状況。チャットの実行はプロバイダーの抽象だけを使い、各 AI の SDK・CLI を直接呼ばない。プロバイダーの節のパスは `core/providers/` から。

## 抽象（`types.ts`）

- `AgentProvider` は `status()`・`run(params, callbacks, signal)` と任意の機能（`usage`・`models`・`fork`・`login` など）。対応しない機能は持たない。
- できることは `features.ts` の `providerFeatures` が任意の機能の有無から作る（画面の押せない理由と、コアの断る文 `providerFeatureMissing` も同じ）。
- 失敗は投げずに `ProviderTurnResult` で返し、止められたら `cancelled`。記録の `user` / `approval` / `result` などはコアが作り、プロバイダーは出さない。
- AI を足すときは `index.ts` の `createProviders` と `PROVIDER_IDS`。確かめる前の AI は `KICKOFF_EXPERIMENTAL_PROVIDERS` のときだけ本物を使う（ほかは `planned.ts`）。
- チャットの AI は作るときに決め、途中では変えない。違う AI の子チャットは会話を引き継がない（セッションの形が違う）。
- モデルの一覧は `modelCatalog.ts`（一覧にないモデルを外す `knownModel` も同じもの）。
- API キーは `keys.ts` が `secrets` に暗号化して置き、応答・SSE に出さない（`has_api_key` だけ）。
- キーを AI に読ませない: CLI のログインの口を使い、環境変数で渡すのは CLI が子プロセスから外せると確かめたものだけ。サブスクではアプリは資格情報を持たない。
- AI の操作ツールはプロバイダーが作らない（口は `@/foundation/core/aiTools/`）。`params.tools` を各 CLI の MCP の書き方に直すだけ。
- MCP の鍵は JSON-RPC か標準入力の中で渡し、起動の引数・環境変数に載せない。API キーも起動の引数に載せない（`ps` で見える）。
- 記録の名前と入力の形は Claude Code にそろえる（画面のツールの表示・変更カードがその名前を前提にする）。

## Claude（`claude/`）

| ファイル | 役目 |
|---|---|
| `provider.ts` | `ClaudeProvider`（状態・使用枠・モデル・実行・分岐・ファイルを戻す・1 回だけ聞く） |
| `sessionFiles.ts` | Claude Code の会話記録のファイル（探す・分岐と乗り換えの切り出し・ゴミ箱へ） |
| `env.ts`・`policy.ts`・`sandbox.ts`・`preCompact.ts` | 環境変数・フック（文脈・守り）・Bash の砂場・圧縮前指示のフック |
| `messages.ts`・`approvals.ts`・`input.ts`・`mcpServers.ts` | SDK のメッセージ → 記録・承認の頼み・ストリーミング入力・MCP の登録 |
| `commandOutput.ts`・`background.ts`・`turnOver.ts`・`usage.ts` | 実行中のコマンドの出力・裏の作業・入力を閉じる時・使用枠 |

- 会話記録の場所と形は Claude Code の内部の決まり。作業フォルダから決まる場所になければ、すべてのプロジェクトを探す（`findSessionFile`）。
- 分岐は、直近の区切りだけを切り出した一時のセッションを写す（`writeRecentSegments`。丸ごと写すと重い）。
- 送るたびに変わる文脈はシステムプロンプトでなく `turnContextHook` で添える（続きのセッションはシステムプロンプトを使い回す）。
- 承認カードで聞くフックと MCP のツールは待ち時間を長くする（書かないと、答える前にカードが閉じて拒否になる）。
- `askOnce` は空の一時フォルダで動かす（起動したフォルダの CLAUDE.md が答えに混ざる）。
- 使わせないツールは `KICKOFF_DISALLOWED_TOOLS`。ほかの AI に同じ働き（会話ごと作業場所を移す）のツールが足されたら、同じく外す。
- 使用枠の API は SDK の EXPERIMENTAL。形が変わったら `usage.ts` の `normalizeUsage` を直す。
- 入力は、まだ渡していない発言があるうちは閉じない。裏の作業は `background_tasks_changed` の一覧で丸ごと置き換える。
- 圧縮の区切りでは、要約の記録 `compact` を先に出してから圧縮中を外す（`messages.ts`）。

## Codex（`codex/`）

- `codex app-server`（口は ACP と共有の `stdioRpc.ts`）で動かす。形は `generate-ts` から使う分だけを `protocol.ts` に写した（版を上げたら見比べる）。
- 守りのフックは `hooks.ts`・`hookServer.ts`・`hookTrust.ts`・`preToolUse.ts`、起動と上書きは `config.ts`（純粋関数）。
- 利用者の `~/.codex/config.toml` はそのまま読ませ、Kickoff が決めるものだけをスレッドの上書きで渡す（config.toml を書き換えない）。
- 作業フォルダの信頼は毎回 `trusted` で伝える（伝えないと Codex が config.toml に書き足し続ける）。パスに「.」が入るので入れ子で渡す。
- 守りは「フックで守り、コマンドは砂場の中」: 承認の決まりは `on-request`、守りと権限モードは PreToolUse のフックで当てる。
- フックの口に届かない・失敗したら断る。フックが信頼済み・有効にならなければ作業を始めない（`HOOK_INACTIVE`。守りなしで動かさない）。
- 砂場の外で流す頼みは決まったコマンド（`sandboxExit.ts`）だけ通す。承認の答えに理由の欄がないので、断った理由は `turn/steer` で伝える。
- API キーは `CODEX_API_KEY` で渡す（`account/login/start` の apiKey は、利用者のサブスクのログインを消すので使わない）。

## 承認を聞いてくる CLI の共通の決まり（`guardedApproval.ts`）

- 守りの判定（`@/features/guard/core/guard/judgeTool.ts`）と権限モードから、同じ `guardOutcome` → `modeOutcome` で決める（Copilot・ACP・Codex）。CLI ごとに違うのは答えと理由の渡し方だけ。

## GitHub Copilot（`copilot/`）

- SDK の本体は使うときにだけ `import()` する（`sdk.ts`。コアの起動を遅くしない）。
- 承認はすべて聞く形にして共通の決まりで答え、ツールの前のフックでも断る守りを当てる。
- ランタイムの環境から GitHub のトークンを外す（それでログインするため）。そのため Copilot のチャットの gh・git は gh で有効なアカウントで動く。

## ACP の共通の変換係（`acp/`）と Cursor（`cursor/`）・Gemini（`gemini/`）

- CLI ごとの違いは `AcpProviderSpec` だけで、ほかは初期化の答え（`agentCapabilities`）で分ける。
- エージェントのモードは「毎回聞く」か `plan` にし、権限の頼みで守りを当てる（`modeFor`）。ACP には砂場の口がなく、Bash の砂場は写せない。
- MCP は初期化の答えが `mcpCapabilities.http` を出したときだけ渡す（stdio にすると、鍵を引数か環境変数に載せることになる）。
- 作業中に足す発言・断った理由は、いまの指示が終わってから同じ実行の中で次の指示として送る（ACP に口がない）。
- Gemini は API キーでだけ動かす（Google のアカウントでほかのアプリから使うのは、利用規約が禁じる）。

## 実行（run）の決まり

- 設定は Claude Code と同じく読む（`settingSources` に user / project / local）。モデル・推論の深さは、決めていなければ指定しない。
- 入力を閉じるのは、`session_state_changed` の `idle` で裏の作業がないとき（`turnOver.ts`）。返答の終わり（`result`）だけでは閉じない。
- 指示の `promptId` を `uuid` で渡す（`enableFileCheckpointing` と合わせて、巻き戻しでその発言の時点に戻すため）。
- 使用枠・モデル・/ のコマンド・ファイルを戻すは、送らないセッションで制御の API だけを呼ぶ（`withIdleSession`。枠を使わない）。
- 砂場のオフ（`disableSandbox`）を受けるのは Claude と Codex だけ（ほかは `@/features/chat/core/turn.ts` が断る。足す AI はその判定も直す）。

## チャットの AI の画面（`ui/provider/`）

- 選んだ AI は送るときの本文の `provider` で、送ったあとは変えない。選べない理由は `providerPickBlock`、決まりは `providerChoice.ts`。
- その AI にない機能は、`ChatProviderContext` の中の部品が `useFeatureBlock(機能)` で理由を読んで止める（文はコアと同じ `providerFeatureMissing`）。
- AI の状態は入れる側（`useProviderStatus` の `load`）だけが読み込みを頼み、中の部品は読むだけ。
- 前に出しているチャットの AI（`noteForegroundProvider`）は裏のタブで上書きしない（下の帯が読む）。
- AI を替えたら、チャット欄の選択はコアが当て直した値に合わせ直す（`useChatOptions`。前の AI のモデルを送らない）。

## 使用状況（`core/usage/`・`ui/usage/`）

- Claude のプランの使用枠は `planUsage.ts` の `UsageMonitor`（メッセージを送らないので枠を使わない）。Codex のクレジットは `codexCredits.ts`。
- サービスごと（`core/usage/services/`）は 1 ファイルずつ `defineFetcher` で作り、1 つが失敗・遅れても、ほかは出す（`services.test.ts`）。覚える時間は画面の取り直しと同じ `USAGE_REFRESH_MS`。
- 各サービスのログイン情報は読むだけで更新しない（更新するとその CLI のログインが切れる）。名乗りは `USER_AGENT`（ほかのアプリのふりをしない）。
- 画面の使用枠の店は App が 1 つ持つ。残り時間を進める時計は `UsageMeter` に置く（App に置くと全体が描き直る）。帯に並べる AI は `usageGroups.ts`。
- 超過分・クレジットの言葉は `@shared/ai/overage`（AI の get_usage と同じ）。
