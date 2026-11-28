# 版と更新（`features/updates`）

この版の番号・ビルド番号・短い SHA を出す。受け入れの一覧: `docs/features.md` の `SET-029` から。

## 地図
- 版の情報: ビルドのときに `scripts/build-stamp.mjs` が作り、`electron.vite.config.ts` がメインに `__KICKOFF_BUILD__` として埋め込む。読むのは `desktop/buildInfo.ts` だけ（形は `@shared/updates/types`、文は `@shared/updates/buildLabel`）。
- メインの部品は `desktop/index.ts` の `updatesDesktop`（IPC の `updates`・「Kickoff について」の窓）。
- `ui/`: 設定の節「Kickoff について」（`ui/settings/`）。`window.kickoff` は `ui/native.ts` だけ。

## 決まり
- ビルド番号はコミットの数（手で数えない）。作り方は環境変数 `KICKOFF_BUILD_KIND`（publish が `release`、install-app が `local` / `adhoc`。付けなければ `dev`）。知らない値はビルドを止める。
- 版の文は `buildLabel` 1 つ（設定とメニューの窓で同じにする）。

## 落とし穴
- テスト: `@shared/updates/*.test.ts`・`scripts/build-stamp.test.mjs`。
