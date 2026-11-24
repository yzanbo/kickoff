# 設定の画面（`features/settings`）

アプリの設定のダイアログ `SettingsDialog`（節の id で開く。部品からは `openSettings(section)`）と、設定の値の宣言の束ね。受け入れの一覧: `docs/features.md` の `SET-`。

## 地図
- `ui/points.ts`: 拡張点 `settingsSections`・`settingsItems`（`scope: "app"` はアプリの設定、`project` はプロジェクトの編集 `ProjectEditDialog`）
- アプリの設定の店は土台の `@/foundation/ui/settings/appSettings.ts`（`useAppSettings`・`saveSettings(patch)`・`applySettings(patch)`）。`ui/DisplaySettings`（`section: "display"` の欄を並べる）
- 節と欄の部品は各機能の `ui/settings/`（AI・音声・スマホ連携・通知など）
- 値の表 `@shared/<機能>/settings.ts`（`setting({ default })`）・PUT の zod は機能の `core/settings.ts`（`defineSettingSchemas`）。束ね `@/app/shared/settings.ts`（`ALL_SETTINGS`）・`@/app/core/settings.ts`

## 決まり
- 設定の値の宣言は機能ごとの `@shared/<機能>/settings.ts`（表と zod の書き忘れは型検査で落ちる）。
- 上の機能が設定の変更に挟む処理は `SettingsApi.onUpdate`（`before` は保存前で throw すれば断る、`after` は保存後で応答の前に待つ。notes が共通のノートのフォルダで使う）。PUT /api/settings の道だけに効く（コアの中の `k.settings.update` は通らない）。
- アプリの設定は下書きにせず、選んだらすぐ保存する（保存のボタンはない）。送るのは `saveSettings` だけ（応答を待たずに店へ入れ、失敗したら読み直して投げる）。待たずにお知らせで済ませる欄は `applySettings`。
- テキストの欄は `CommitInput`（欄の外を押す・Enter で保存）。選ぶ欄は `ChoiceField`・`SwitchField`。キーの文字は `useCommandKeys` で表から出す。
- API キーは保存したら欄を消し、置いたか（`has_api_key`）だけを出す。

## 落とし穴
- 書きかけは、ほかで変わっても保つ（ピントのある間はほかの変更で書き換えない）。
- テスト: `ui/points.test.ts`・`@/app/core/settings.test.ts`。
