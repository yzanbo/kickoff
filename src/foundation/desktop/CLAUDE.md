# メインプロセス（src/main）の説明

Electron のメインプロセス。窓・OS の口・仲立ちだけを持ち、コアは別のプロセス（`utilityProcess`）で動かす（メインの糸は画面の入力の道でもあるので重さを乗せない）。

## 構成と起動
<!-- 行き先: src/foundation/desktop/ -->
- `index.ts` は起動の順番だけを書く（順と理由はそのコメント）。中身は `app/`（環境・コアのプロセス・窓・別ウィンドウ `popouts.ts`・メニュー・終了・子の Electron・セッションと権限・起動の記録）/ `ipc/` / `browser/` / `terminal/` / `notifications/` / `diagnostics/` / `platform/`。
- OS ごとの処理は `platform/` の口（`hostPlatform`・`desktopPlatform`）に集め、`platform/index.ts` で選ぶ。DB ワーカーのシェルの口だけはワーカーの入口が選ぶ（OS を足すときは両方）。
- Electron に依らない判定・組み立ては別のファイルに分けてテストする（`app/urls.ts`・`ipc/register.ts` など）。
- メインはログインシェルの PATH を読まない（読むのはコア）。
- CDP のポートは `KICKOFF_REMOTE_DEBUG` のときだけ開く。`KICKOFF_USER_DATA_DIR` は開発時だけ見る（`measureDataDir`。製品版の DB を読まない）。

## 終了
<!-- 行き先: src/foundation/desktop/ -->
- 片付けは `app/shutdown.ts` の `registerShutdown` 1 か所（子の Electron → コアの `close` → `exitKeepingNotifications`。順と理由はその JSDoc）。
- メインはコアのプロセスを直接止めない（RPC の `close` を頼んで待つ）。`reallyExit` は後片付けを飛ばすので、コアを必ず先に終わらせる。`app.quit()` を呼び直さない。
- 子の Electron はメインプロセスにだけ先に SIGTERM を送る（`app/childApps.ts`。シェルを先に止めると開発版の localStorage が消える）。

## IPC
<!-- 行き先: src/foundation/desktop/ -->
- 取り決めは `@shared/ipc` の `NATIVE_API`（`src/shared/CLAUDE.md` の「IPC の取り決め」）。登録は `ipc/register.ts` を通す（送り手と引数の zod をそこで確かめ、処理で繰り返さない）。
- 画面から届いたパスは信じない（解決してから比べる）。足すときは `NATIVE_API` → `IPC_ARGS`（`ipc/args.ts`）→ 処理の順。

## 画面のセッションと権限
<!-- 行き先: src/foundation/desktop/ -->
- 子のプロセスは `utilityProcess` で起動する。`ELECTRON_RUN_AS_NODE` の形を足さない（製品版は fuses で切る。`electron-builder.yml`）。
- DB ワーカーはメインが起動し、コアと `MessageChannelMain` で直結する（話はメインを通らない）。
- キーチェーンの鍵（`app/secretCipher.ts`）は非同期の口で、初めて使うときに取る。マイクはアプリ自身の画面だけ許す（`app/mediaPermission.ts`）。

## ウィンドウ・外のアプリ
<!-- 行き先: src/foundation/desktop/ -->
- 窓は `app/window.ts`（窓がなければ `showMainWindow` が作り直す）、外のアプリは `app/externalApps.ts`、選ぶ窓は `app/dialogs.ts`。
- 窓の地の色は画面のテーマに合わせる（`app/appearance.ts`。メインは localStorage を読めない）。

## 埋め込みブラウザ（browser/）
<!-- 行き先: src/features/browser/ -->
- ページは信頼しない外部のもの（`hardenWebviews`。窓を作る前に登録）。操作は頼んできた画面の中の webview に限る（`isOurWebview`）。
- 開発者ツールは webview の中に出さず、埋め込みブラウザのセッションの WebContents に出す。どこに出したかは画面が持つ（Electron の知らせは遅れる）。

## ターミナル・眠らせない・通知
<!-- 行き先: src/foundation/desktop/ -->
- シェルはコア（`src/core/CLAUDE.md` の「ターミナル」）。メインは消えた画面のシェルをコアに止めさせるだけ（`terminal/terminals.ts`）。
- 眠らせない決まりは `app/keepAwakeRules.ts`。ログイン時に起動は OS の設定を読み、DB に持たない（開発版は切り替えない）。
- 通知の要否と文はコア（`src/core/CLAUDE.md` の「通知」）。メインは知らせ `notify` で出すだけ。

## 診断の記録（diagnostics/）
<!-- 行き先: src/features/diagnostics/ -->
- 性能（`diagnostics.ts`）・詰まり（`stalls.ts`）・起動の時刻とメモリ（`bootRecorder.ts`）・設定の「診断」のまとめ（`logOverview.ts`）。書き先はログの場所（`app/logs.ts`。保存先はエージェントが読めない）。
- 時刻は epoch ms でそろえる。ログを回すのはメインだけ（コアが書き足す前に）。

## コアのプロセス（app/coreProcess.ts）
<!-- 行き先: src/foundation/desktop/ -->
- RPC の形は `src/core/host/protocol.ts` 1 か所。HTTP・SSE・WebSocket は画面からコアへ直接。
- 落ちたら残った子を止めてから作り直す（古い子が書いている間に再開すると食い違う）。
- コンパイルキャッシュ（`app/compileCache.ts`）を `~/Library/Caches` に置かない（AI の砂場が書ける）。

## 起動の記録・製品版の画面の配信
<!-- 行き先: src/foundation/desktop/ -->
- 起動の記録は `app/startupLog.ts`、画面が応答しないときは `app/hangWatch.ts`。
- 製品版の画面はコアが配る（`core/http/rendererCache.ts`）。`src/renderer/public/assets/` に置かない（ハッシュのない名前はビルドが落とす）。
