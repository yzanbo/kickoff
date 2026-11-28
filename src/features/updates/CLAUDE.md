# 版と更新（`features/updates`）

この版の番号を出し、新しい版を確かめて入れる（electron-updater）。受け入れの一覧: `docs/features.md` の `SET-029` から。

## 地図
- 版の情報: `scripts/build-stamp.mjs` が作り、`electron.vite.config.ts` がメインに `__KICKOFF_BUILD__` として埋め込む。読むのは `desktop/buildInfo.ts` だけ（形は `@shared/updates/types`、文は `buildLabel`）。
- メイン: `desktop/index.ts`（`updatesDesktop`。IPC・メニューの「アップデートを確認…」・版が変わったときの HTTP キャッシュ `cacheReset.ts`）・殻 `updater.ts`・移り変わり `updateModel.ts`。様子の読み方（確かめないか・版）はメインと画面で `@shared/updates/state` 1 つ。
- 設定 `@shared/updates/settings`（自動で確かめる・飛ばした版）。メインはコアに RPC の `updates.settings` で聞く。配る場所は `@shared/updates/distribution.json` 1 か所（publish も読む）。
- `ui/`: 帯と ⚙ の印 `UpdateBanner`（決まりは `updateBannerModel.ts`。settings の `SETTINGS_SLOTS` に入れる）・節 `AboutSettings`・様子の店と殻の hook `updatesStore.ts`。`window.kickoff` は `ui/native.ts` だけ。

## 決まり
- 確かめるのは印鑑で署名した製品版（作り方 `release`・`local`）だけ。開発版・`ADHOC=1` の版は確かめない（印鑑が違うと入らない）。
- 窓・通知・音は出さない。通信の失敗は何も出さず次の回（印も消さない）。手で確かめたときだけ結果を帯に出す（確認中は 0.5 秒以上）。
- 見つけても自動では取りに行かず、飛ばした版でなければ取りに行く（`autoDownload: false`）。終了のときに黙って入れない（`autoInstallOnAppQuit: false`）。`channel` は代入しない（`allowDowngrade` が true になる）。
- 作業中のチャットの数はコアの `awake` の `running`（install-app と同じ数え方）。
- 作り方は環境変数 `KICKOFF_BUILD_KIND`。知らない値はビルドを止める。

## 落とし穴
- Squirrel の印鑑の確かめは `quitAndInstall` の中。にせものは `error` で届き、アプリは終わらない（`failed` にして Releases へ案内）。
- 開き直す前に窓を聞かずに閉じる（別ウィンドウの閉じ方を聞く部品が、閉じるのを止めるため）。
- テスト: `desktop/*.test.ts`・`ui/*.test.ts`・`core/routes.settings.test.ts`・`@shared/updates/*.test.ts`・`scripts/build-stamp.test.mjs`。
