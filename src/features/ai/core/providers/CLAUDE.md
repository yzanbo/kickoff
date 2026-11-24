# プロバイダーの実装（`features/ai/core/providers`）

AI ごとの CLI・SDK のつなぎ方。共通の口は `types.ts`、共有の小物は `shared/`。

## 地図
| AI | 動かし方 | 寄りかかる所（外の形を写す 1 ファイル・確かめた版） |
|---|---|---|
| `claude/` | Agent SDK の `query` | `wire.ts`（`TESTED_VERSION`）・`internals.ts`（会話記録の場所・環境変数） |
| `codex/` | `codex app-server`（`stdioRpc.ts`） | `protocol.ts`（`TESTED_VERSION`） |
| `copilot/` | `@github/copilot-sdk` | `sdk.ts`（SDK を読む唯一の所。使うときに `import()`） |
| `acp/`・`cursor/`・`gemini/` | Agent Client Protocol（違いは `AcpProviderSpec`） | `protocol.ts`・`gemini/provider.ts` の `TESTED_VERSION` |

## 決まり
- SDK・外の CLI の形を読むのは上の 1 ファイルだけ（構造の検査 `ai-*`）。版を上げたら写した形と見比べる。
- 守り: Claude はフック（PreToolUse）、聞いてくる CLI は `guard` → `byMode`（`permissionMode.ts`）。Codex は承認を `on-request` にしてフックで当て、フックが有効にならなければ始めない（`HOOK_INACTIVE`）。ACP はモードを「毎回聞く」か `plan` にして権限の頼みで当てる（砂場の口はない）。
- 設定は各 CLI と同じく読む（Claude は `settingSources`、Codex は config.toml を書き換えずスレッドの上書きで渡す）。モデル・深さは決めていなければ指定しない。
- 鍵は引数・環境変数に載せない（ACP の MCP は `mcpCapabilities.http` のときだけ）。Codex の API キーは `CODEX_API_KEY`（ログインの口は使わない）。Gemini は API キーだけ。

## 落とし穴
- 中断済みの signal は後から登録しても知らせが来ない（起動の途中の止めは `turnLifecycle.ts` が `signal.aborted` を先に見る）。
- Claude: 入力を閉じるのは `session_state_changed` の `idle` で裏の作業がないとき（`result` だけでは閉じない）。`promptId` を渡す（巻き戻しの目印）。送るたびの文脈は `turnContextHook`。承認の待ち時間は `APPROVAL_WAIT_S`。圧縮では要約の `compact` を先に出す。
- Claude の実行の外（使用枠・モデル・ファイルを戻す）は送らないセッション `withIdleSession`。`askOnce` は空の一時フォルダで動かす。分岐は直近の区切りだけを写す。
- Codex: 作業フォルダの信頼は毎回 `trusted` で伝える（入れ子で渡す）。断った理由は `turn/steer` で伝える。
- Copilot: ランタイムの環境から GitHub のトークンを外す（gh で有効なアカウントで動く）。ACP: 作業中の発言・断った理由は指示が終わってから次の指示で送る。
- `tell` は受け付けた時点で true を返す（記録も残る）。あとで断られた・送らずに終わったら `tellFailedNotice` で知らせる。
- テスト: `contract.test.ts`・各フォルダの `*.test.ts`。
