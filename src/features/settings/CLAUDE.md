# 設定の画面（`src/features/settings`）

設定のダイアログ `SettingsDialog`（節の id で開く。部品から開くときは `openSettings(section)`）。節・欄の部品と登録（`appSettings.ts`）は各機能の `ui/settings/` にある。

- 節と欄は拡張点 `settingsSections`・`settingsItems`（`ui/points.ts`）に持ち主が登録する（`scope: "app"` はアプリの設定、`project` はプロジェクトの編集 `ProjectEditDialog` で、中で `useEditedProject`）。「表示」の節（`DisplaySettings`）は `section: "display"` の欄を並べる。

| 置き場所 | 中身 |
|---|---|
| `@/features/ai/ui/settings/` | AI の既定・ログインの仕方（`AiDefaultsSettings`・`ProviderAuthSettings`） |
| `@/features/voice/ui/settings/` | 音声入力 |
| `@/features/devices/ui/settings/` | スマホ連携（`src/features/devices/CLAUDE.md`） |
| `@/features/notifications/ui/settings/` | 通知（知らせるかはコアが決める。`src/features/notifications/CLAUDE.md`） |

- 項目は機能ごとに宣言する: 表は `@shared/<機能>/settings.ts`（`setting({ default })`）、PUT の zod は機能の `core/settings.ts`（`defineSettingSchemas` が表と突き合わせ、書き忘れは型検査で落ちる）。束ねは `@/app/shared/settings.ts`（`ALL_SETTINGS`。`AppSettings` の形もここで足す）と `@/app/core/settings.ts`。
- アプリの設定は下書きにせず、選んだらすぐ保存する（保存のボタンはない）。送るのは `saveSettings(patch)`（応答を待たずに店へ入れ、失敗したら読み直して投げる）だけで、待たずにお知らせで済ませる欄は `applySettings(patch)`。テキストの欄は `CommitInput`（欄の外を押す・Enter で保存。ピントのある間はほかの変更で書きかけを書き換えない）。
- 選ぶ欄は `ChoiceField`・`SwitchField`（`Field` と `Segmented` を手で組まない）。説明の文のキーの文字は `useCommandKeys` で表から出す。
- API キーは保存したら欄を消し、置いたか（`has_api_key`）だけを出す。
- 対応予定の AI の札と一言は ai の `provider/plannedProviders.ts`（プロバイダーの `implemented` から決める）。
