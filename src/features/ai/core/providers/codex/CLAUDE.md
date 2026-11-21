# Codex（`core/providers/codex`）

`codex app-server`（口は ACP と共有の `stdioRpc.ts`）で動かす。寄りかかっている所は `protocol.ts`（`generate-ts` から使う分だけを写した形。確かめた版は `TESTED_VERSION`。版を上げたら見比べる）。

- 守りのフックは `hooks.ts`・`hookServer.ts`・`hookTrust.ts`・`preToolUse.ts`、起動と上書きは `config.ts`（純粋関数）。
- 利用者の `~/.codex/config.toml` はそのまま読ませ、Kickoff が決めるものだけをスレッドの上書きで渡す（config.toml を書き換えない）。
- 作業フォルダの信頼は毎回 `trusted` で伝える（伝えないと Codex が config.toml に書き足し続ける）。パスに「.」が入るので入れ子で渡す。
- 守りは「フックで守り、コマンドは砂場の中」: 承認の決まりは `on-request`、守りと権限モードは PreToolUse のフックで当てる。
- フックの口に届かない・失敗したら断る。フックが信頼済み・有効にならなければ作業を始めない（`HOOK_INACTIVE`。守りなしで動かさない）。
- 砂場の外で流す頼みは決まったコマンド（`sandboxExit.ts`）だけ通す。承認の答えに理由の欄がないので、断った理由は `turn/steer` で伝える。
- API キーは `CODEX_API_KEY` で渡す（`account/login/start` の apiKey は、利用者のサブスクのログインを消すので使わない）。
- 使用状況は `usage.ts`（ChatGPT のプランの枠とクレジット）。実行中のクレジットの知らせは `catalog.ts` の `creditsNoteOf` から `spending` で渡す。
