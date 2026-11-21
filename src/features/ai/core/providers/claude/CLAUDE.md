# Claude Code（`core/providers/claude`）

Agent SDK の `query` で Claude Code を動かす。寄りかかっている所は 2 ファイルに閉じる: `wire.ts`（SDK の型・型にない欄・同梱の版。確かめた版は `TESTED_VERSION`）と `internals.ts`（会話記録の場所・環境変数・`claude auth status` の形）。

| ファイル | 役目 |
|---|---|
| `provider.ts`・`run.ts`・`turnTracker.ts` | `ClaudeProvider`（状態・モデル・分岐ほか）・1 回の実行・メッセージ 1 件ごとの記録係（純粋） |
| `sdk.ts`・`idleSession.ts` | 差し込み口 `ClaudeSdk`（テストは偽の SDK）・送らないセッション |
| `sessionFiles.ts` | 会話記録のファイル（探す・`segmentStart` と `writeSlice` で切って書く・ゴミ箱へ） |
| `env.ts`・`policy.ts`・`sandbox.ts`・`preCompact.ts` | 環境変数・フック（文脈・守りの門・砂場の説明）・Bash の砂場・圧縮前指示のフック |
| `messages.ts`・`approvals.ts`・`input.ts`・`mcpServers.ts` | SDK のメッセージ → 記録・承認の頼み・ストリーミング入力・MCP の登録 |
| `commandOutput.ts`・`background.ts`・`turnOver.ts`・`usage.ts` | 実行中のコマンドの出力・裏の作業・入力を閉じる時・プランの使用枠 |

## 実行

- 設定は Claude Code と同じく読む（`settingSources` に user / project / local）。モデル・推論の深さは、決めていなければ指定しない。
- 入力を閉じるのは、`session_state_changed` の `idle` で裏の作業がないとき（`turnOver.ts`）。返答の終わり（`result`）だけでは閉じない。まだ渡していない発言があるうちも閉じない。
- 指示の `promptId` を `uuid` で渡す（`enableFileCheckpointing` と合わせて、巻き戻しでその発言の時点に戻すため）。
- 送るたびに変わる文脈はシステムプロンプトでなく `turnContextHook` で添える（続きのセッションはシステムプロンプトを使い回す）。
- 承認カードで聞くフックと MCP のツールの待ち時間は `APPROVAL_WAIT_S`（書かないと、答える前にカードが閉じて拒否になる）。
- 裏の作業は `background_tasks_changed` の一覧で丸ごと置き換える。圧縮の区切りでは、要約の記録 `compact` を先に出してから圧縮中を外す（`messages.ts`）。
- 使わせないツールは `KICKOFF_DISALLOWED_TOOLS`。ほかの AI に同じ働き（会話ごと作業場所を移す）のツールが足されたら、同じく外す。
- 砂場のオフ（`sandboxOff`）を受けるのは表の `sandbox_off` の AI だけ（ほかは `@/features/chat/core/turn.ts` が断る）。

## 実行の外

- 使用枠・モデル・/ のコマンド・ファイルを戻すは、送らないセッションで制御の API だけを呼ぶ（`withIdleSession`。枠を使わない）。
- `askOnce` は空の一時フォルダで動かす（起動したフォルダの CLAUDE.md が答えに混ざる）。
- 会話記録が作業フォルダから決まる場所になければ、すべてのプロジェクトを探す（`findSessionFile`）。
- 分岐は、直近の区切りだけを切り出した一時のセッションを写す（`writeRecentSegments`。丸ごと写すと重い）。
