# AI のつなぎ込み（`features/ai`）

プロバイダー・ログイン・モデルと選択・使用状況。チャットの実行はプロバイダーの口だけを使い、SDK・CLI を直に呼ばない。実装ごとの違いは `core/providers/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `AIT-`。

## 地図
- `core/providers/types.ts`: 口 `AgentProvider`・`ProviderTurnParams`・`ProviderCallbacks`。足す所は `providers/index.ts` の `createProviders`
- `@shared/ai/providers`: AI ごとの名前・CLI・色・できること `PROVIDERS`（`providerCan`・`hasCapability`）
- `@shared/ai/chatOptions.ts`: 選択の決め方 `resolveChatOptions`
- `core/usage/monitor.ts`（`UsageMonitor`）・`core/providers/keys.ts`（API キー）・`core/testing.ts`（偽のプロバイダー）
- `ui/provider/`（`ProviderPicker`・`useFeatureBlock`・`useProviderStatus`・`modelCatalog.ts`）・`ui/options/chatOptionsRules.ts`・`ChatDefaultsFields`・`ui/usage/`

## 決まり
- ほかの機能は `core/index.ts`・`ui/index.ts` からだけ読む。実装どうしは読まない（Cursor・Gemini は `acp/` の上）。
- AI の ID は閉じた一覧（`PROVIDERS`）。AI の名前で if を書かず、できることで分ける。任意の機能（`models`・`fork`・`login`・`sessions`）は対応する AI だけが持つ。
- 選択は `resolveChatOptions` 1 つ（アプリの既定 → プロジェクトの既定 → 送るときの指定の順に、書いた項目だけを重ねる）。プロジェクトの既定は表 `project_ai_defaults`。
- 失敗は投げずに `ProviderTurnResult` で返す（止められたら `cancelled`）。記録の `user` / `approval` / `result` はコアが作る。
- チャットの AI は作るときに決め、途中で替えるのは providerSwitch だけ。違う AI の子チャットは会話を引き継がない。
- AI の操作ツールは `params.tools` を各 CLI の MCP の書き方に直すだけ。記録の名前と入力の形は Claude Code にそろえる（`toolUse`）。守りはどの AI も `params.gate`。
- API キーは `secrets` に暗号化して置き、応答・SSE・起動の引数に出さない。Kickoff 自身はほかのアプリ・CLI の認証ファイル・DB・キーチェーンを読まない。使用状況とログイン状態は公式の CLI・SDK の口で取得する。取らない枠は公式の確認先を出し、認証情報を直接読む方式へ戻さない。

## 落とし穴
- 確かめる前の AI は `KICKOFF_EXPERIMENTAL_PROVIDERS` のときだけ本物を使う（ほかは `planned.ts`）。AI を足したら適合テストの adapter（`core/testing/providerAdapters.ts`）も足す。
- その AI にない機能は `useFeatureBlock` で理由を読んで止める（文はコアと同じ `providerFeatureMissing`）。前に出しているチャットの AI は裏のタブで上書きしない。
- 使用状況は同じ AI の取得に相乗りし、終わった AI から SSE で配る。一覧の最初の取得も待ち時間に上限を設け、1 つが失敗してもほかは出す。
- 下の帯と設定の「使用状況」の自動更新は、使っている間だけ共有の店が行う。
- 下の帯の使用状況は窓の幅で詰める（`FooterUsage.css`。1000px 以下でバー、820px 以下で枠の名前を見た目だけ隠し、名前は乗せたときの説明に出す）。それでも入らなければ帯の中で切り、窓の外へはみ出させない（画面の横幅が広がる）。
- テスト: `core/providers/contract.test.ts`（7 つの筋書き × 4 つの AI）・`core/**/*.test.ts`。
