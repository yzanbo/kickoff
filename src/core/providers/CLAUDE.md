# プロバイダー（src/core/providers）の説明

エージェントの実行基盤。コア（`chat/`）はこの抽象だけを使い、Claude Code の SDK を直接呼ばない。

## 抽象（types.ts）

- `AgentProvider`: `id`・`label`・`implemented`（false なら画面は「未対応」と出し、実行を受け付けない）・CLI の状態 `status()`・1 回の実行 `run(params, callbacks, signal)`。任意の機能（`usage` / `models` / `commands` / `title` / `summarize` / `fork` / `rewindFiles`）は対応しなければ持たない（ないときコアは、一覧なら空・名前は付けない・分岐と巻き戻しは 400 にする）。
- 渡すもの `ProviderTurnParams`: 作業場所・指示と、その ID `promptId`（記録の `message_uuid`）・既定のシステムプロンプトに足す文 `systemPrompt`・許可 `policy`（`ChatPolicy`）・続きのセッション `resumeSessionId`・選択（`model` / `effort` / `permissionMode` / `fastMode`。null は指定しない）・読めるフォルダ `additionalDirectories`・読むだけのパス `readOnlyPaths`。
- 知らせ `ProviderCallbacks`: `emit`（記録になる形。`user` / `approval` / `approval_resolved` / `result` はコアが作るので含めない）・途中経過 `stream` / `subagentProgress` / `commandOutput`（実行中のコマンドの出力の終わりの部分。保存しない）・承認 `requestApproval`（回答まで待つ）・作業中の様子 `retry` / `background` / `compacting`・圧縮の失敗 `compactFailed`（理由を渡すだけで、お知らせに残すかはコアが決める）・作業中の操作 `control`（`TurnControl` の `tell` = 止めずに発言を足す / `stopTask` = 裏の作業を 1 つ止める。終わったら null）。
- 結果 `ProviderTurnResult`: 状態（`completed` / `failed` / `cancelled`）・セッション・費用・回数・コンテキストの大きさと上限・メインの会話の最後のメッセージの ID `lastMessageId`（分岐の起点）・通信の切断か `network`・使用枠の上限 `usageLimit`（枠が戻る時刻）。失敗は投げずに結果で返し、止められたら `cancelled`。
- 足すときは `index.ts` の `createProviders` に足す。Codex・Gemini はまだ使えない `planned.ts` の `PlannedProvider`（CLI が入っているかだけ確かめ、実行は断る）。認証は各 CLI のログインをそのまま使い、アプリは資格情報を持たない。

## Claude（claude/）

役割ごとにファイルを分ける:

- `provider.ts` の `ClaudeProvider`: 状態（`claude auth status`。プランは種類より表示名 `readPlanDisplayName`）・使用枠・モデル・/ のコマンド・実行・分岐（`forkSession`。作業フォルダが消えていれば、すべてのプロジェクトから探す）・ファイルを戻す・名前を付ける・メモにするため要約する（どちらも `askOnce` で haiku に 1 回だけ。空の一時フォルダで動かす。Kickoff を起動したフォルダで動かすと、そこの CLAUDE.md・自動のメモリーを読み込んで答えに混ざる）。
- `env.ts`: 同梱の Claude Code の実行ファイル（`resolveClaudeExecutable`。製品版では `app.asar.unpacked` の中）と、子プロセスの環境変数（`agentEnv`。プランで動かすため API キーの環境変数は渡さない。`KICKOFF_ALLOW_API_KEY=1` のときだけ許す）。
- `policy.ts`: 断るフック `turnHooks`（PreToolUse。Kickoff 自身を守る判定はいつも、参照資料への書き込みの判定は参照資料があるときだけ。判定そのものは `chat/guard/`）と、`ChatPolicy` を `allowedTools` にする `toAllowedTools`（Read・Glob・Grep・TodoWrite・Web と、許すコマンドの `Bash(<コマンド>:*)`。ファイルの編集は権限モードに任せる）。
- `messages.ts` の `emitSdkMessage`: SDK のメッセージを記録の形にする（思考の時間・サブエージェントの開始と終了・圧縮の `status` / `compact_boundary`・圧縮の失敗の理由（`compactFailed` に渡す）。裏のコマンドなど、サブエージェントでないタスクは除く）。
- `approvals.ts` の `createCanUseTool`: `canUseTool` を承認依頼にし、回答を判定にする（AskUserQuestion は質問で、回答は入力に足して通す。答えなければスキップとして断る。それ以外は許可で、「常に許可」は提案された許可ルールを当てる）。
- `input.ts` の `createInputChannel`: ストリーミング入力。最初の指示のあとも開いておき、作業中に発言を足す・裏の作業を止める（`stopTask` にも入力が開いている必要がある）。まだ渡していない発言があるうちは閉じない（足した発言を落とさない）。
- `commandOutput.ts` の `createCommandOutputWatcher`: 実行中のコマンドの出力を終わる前から届ける（SDK は Bash の出力を終わってからしか渡さず、`tool_progress` も Bash には届かない）。Claude Code はコマンドの出力をその場で `<一時フォルダ>/claude-<uid>/<作業場所>/<セッション ID>/tasks/<作業 ID>.output` に書いているので、`task_started`（`task_type: local_bash`。手前のコマンドも裏のコマンドも）が届いたらそのファイルを探し（作業場所の部分は Claude Code の内部の決まりなので計算せず、`findOutputFile` で `<セッション ID>/tasks/<作業 ID>.output` を探す。場所の候補は `defaultOutputRoots`）、0.5 秒ごとに増えた分を読んで、最後の `COMMAND_OUTPUT_LINES` 行が変わったときだけ `commandOutput` で知らせる（色の制御文字を除き、`\r` で上書きした行は最後の状態だけ `cleanTerminalText`）。`task_notification`・`task_updated` の終わりの状態・実行の終わり（`stopAll`）でやめる。15 秒探して見つからなければあきらめる（結果は今までどおり終わってから届く）。
- `background.ts` の `createBackgroundTracker`: 裏の作業は `background_tasks_changed`（いま動いているものの一覧）で丸ごと置き換え、開始・終了の知らせの組み合わせには頼らない（1 つ取りこぼしても、実行中のまま固まらない）。返答は result で書き終わり、メインの次の発言で書き始めたとみなす。
- `usage.ts`: 使用枠の変換 `normalizeUsage`（SDK の EXPERIMENTAL な API。形が変わったらここを直す）。Claude Code の設定ファイル（`~/.claude.json`）は読むだけ。
- `labels.ts`: 文言の定数（チャット欄の / に出さないターミナル専用のコマンド `TERMINAL_ONLY_COMMANDS`・ファストモードが使われなかった理由・失敗の種類）。
- `effortDefault.ts` の `claudeEffortDefault`: 推論の深さを指定しないときに Claude Code が使う深さ（環境変数 `CLAUDE_CODE_EFFORT_LEVEL` → 作業フォルダの `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json`。各ファイルはモデルの ID ごとの `modelSettings` → 全体の `effortLevel`。どこにもなければモデル任せ。読むだけ）。API は `GET /api/projects/:id/effort-default?model=`。モデルの別名は `ModelOption.resolved_model` で ID にする。

## 実行（run）の決まり

- 設定は Claude Code と同じく読む（`settingSources` に user / project / local。システムプロンプトは `claude_code` の preset に足す）。モデル・推論の深さは決めていなければ指定しない（SDK とモデルの既定）。ファストモードを指定したのに使われなかったら、理由をお知らせに残す。
- 入力はストリーミングで、作業中の操作を `control` で渡す。返答を書き終え、裏の作業もなくなったら入力を閉じて Claude Code を終わらせる。止めるとプロセスごと終わり、サブエージェント・裏のコマンドも止まる。
- `enableFileCheckpointing` で編集の前のファイルを取っておき、指示には `promptId` を `uuid` として渡す（巻き戻しでその発言の時点に戻すため）。
- 通信の再試行（`api_retry`）は `retry` で知らせ、返答が届き始めたら null。応答のないまま（`error_status` が null）の再試行があった・失敗の文が `isNetworkError` なら、失敗は通信の切断（`network`）。
- 使用枠: `rate_limit_event` の `rejected`（戻る時刻は `resetTimeOf`）・返答のエラー `rate_limit`・失敗の文の `isUsageLimitError` で `usageLimit` を付ける。
- コンテキストの大きさは、メインのエージェントの最後の応答のトークン数（要約のあとは `compact_boundary` の `post_tokens`）と、使ったモデルのうちいちばん大きいコンテキストウィンドウ（サブエージェントの小さいモデルを除くため）。
- 使用枠・モデル・/ のコマンド・ファイルを戻すは、メッセージを送らないセッションを一瞬開いて、制御用の API だけを呼ぶ（`withIdleSession`。モデルへのリクエストがないので枠を使わない）。モデル（1 時間）と / のコマンド（作業場所ごとに 5 分）の一覧は、ルート（`http/routes/providers.ts`）で `ttlCache` に覚える（空の結果は覚えない）。
