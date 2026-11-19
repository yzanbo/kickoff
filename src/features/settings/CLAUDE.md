# 設定の画面（`src/features/settings`）

設定のダイアログ `SettingsDialog`（項目は `SettingsSection`。部品から開くときは `openSettings(section)`）。節の部品は各機能の `ui/settings/` にある。

| 置き場所 | 中身 |
|---|---|
| `@/features/ai/ui/settings/` | AI の既定・ログインの仕方（`AiDefaultsSettings`・`ProviderAuthSettings`） |
| `@/features/voice/ui/settings/` | 音声入力 |
| `@/features/devices/ui/settings/` | スマホ連携（`src/features/devices/CLAUDE.md`） |
| `@/features/notifications/ui/settings/` | 通知（知らせるかはコアが決める。`src/features/notifications/CLAUDE.md`） |

- アプリの設定は `useSettingsDraft` で下書きにし、項目ごとに保存する（書いている途中の下書きをほかの変更で上書きしない）。
- ほかの所からも変わる設定（`ai_create_chat`・確認せずに開くドメイン）と音声入力は、下書きにせず選んだらすぐ保存する。
- API キーは保存したら欄を消し、置いたか（`has_api_key`）だけを出す。
- 対応予定の AI の札と一言は `plannedProviders.ts`（プロバイダーの `implemented` から決める）。
