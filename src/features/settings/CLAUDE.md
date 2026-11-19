# 設定・使用状況・下の帯・診断（`features/settings`・`usage`・`footer`・`diagnostics`）
<!-- 行き先: src/features/settings/ -->

設定のダイアログ `SettingsDialog`（項目は `SettingsSection`。部品から開くときは `openSettings(section)`）。

| ファイル | 中身 |
|---|---|
| `AiDefaultsSettings`・`ProviderAuthSettings` | AI の既定・ログインの仕方 |
| `Voice*.tsx`・`voiceOptions.ts` | 音声入力 |
| `MobileSettings`・`useMobilePairing` | スマホ連携（コアは `src/core/CLAUDE.md` の「端末とペアリング」） |
| `NotificationSettings` | 通知（知らせるかはコアが決める。`src/core/CLAUDE.md` の「通知」） |

- アプリの設定は `useSettingsDraft` で下書きにし、項目ごとに保存する（書いている途中の下書きをほかの変更で上書きしない）。
- ほかの所からも変わる設定（`ai_create_chat`・確認せずに開くドメイン）と音声入力は、下書きにせず選んだらすぐ保存する。
- API キーは保存したら欄を消し、置いたか（`has_api_key`）だけを出す。
- 対応予定の AI の札と一言は `plannedProviders.ts`（プロバイダーの `implemented` から決める）。

## 使用状況（`features/usage`）
<!-- 行き先: src/features/ai/ -->

- 使用枠の店は App が 1 つ持つ。残り時間を進める時計は `UsageMeter` に置く（App に置くと全体が描き直る）。
- 超過分・クレジットの言葉は `@shared/overage`（AI の get_usage と同じ）。帯に並べる AI は `usageGroups.ts`。

## 下の帯（`features/footer`）
<!-- 行き先: src/app/renderer/ -->

- 高さは起動直後の骨組みの `.boot-footer` と同じにする（変えたら `app/bootScript.test.ts` を通す）。
- 接続が切れた札は、つながらないまま少し経ってから出す（`useConnectionNotice`。一瞬の切断でちらつかせない）。

## ポートを使っているプロセス（`features/footer/ports/`）
<!-- 行き先: src/features/ports/ -->

- 一覧はコマンドの全文を含むので SSE に載せない（`ports_changed` は数だけ。`portsStore.ts`）。Mac のアプリの中だけ。
- 帯を隠しているときの窓は `PortsFallback`。コアは `src/core/CLAUDE.md` の「ポートを使っているプロセス」。

## 診断（`features/diagnostics`）
<!-- 行き先: src/features/diagnostics/ -->

- コアの帯 `CoreStatusBand` は App と別ウィンドウに置く（ブラウザの画面には出さない）。文は `@shared/ipc` の `CORE_STATE_LABELS`。
- 「いつも取っている記録」の文は `overviewLines.ts`。
