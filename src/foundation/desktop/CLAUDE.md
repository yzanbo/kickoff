# メインプロセスの土台（`src/foundation/desktop`）

Electron のメインプロセスと preload（`preload/`）の土台。窓・OS の口・仲立ちだけを持ち、コアは別のプロセス（`utilityProcess`）で動かす（メインの糸は画面の入力の道でもあるので重さを乗せない）。入口は `src/app/desktop/`（`index.ts`・`preload.ts`）。

## 構成と起動
- `@/app/desktop/index.ts` は起動の順番だけを書く（順と理由はそのコメント）。中身は `app/`（環境・コアのプロセス・窓・別ウィンドウ `popouts.ts`・メニュー・終了・子の Electron・セッションと権限・起動の記録）/ `ipc/` / `terminal/` / `notifications/` / `diagnostics/` / `platform/`。埋め込みブラウザ・診断の記録は各機能の `desktop/`（`src/features/browser/CLAUDE.md`・`src/features/diagnostics/CLAUDE.md`）。
- メインの部品は `parts.ts` の `DesktopPart`（土台・コアの帯は `foundationPart.ts`、機能は `desktop/index.ts`）。app が `mergeParts` で並べて `registerIpc`・`createCoreProcess`・メニューに渡す（同じまとまりが 2 つなら起動で投げる）。窓は `app/window.ts` の `createAppWindow`、別ウィンドウの種類ごとの違いは `app/popouts.ts` の `POPOUT_KINDS`、全窓への知らせは `broadcast`、ほかのプロセスを止めるのは `app/processes.ts`。
- OS ごとの処理は `platform/` の口（`hostPlatform`・`desktopPlatform`）に集め、`platform/index.ts` で選ぶ。DB ワーカーのシェルの口だけはワーカーの入口が選ぶ（OS を足すときは両方）。
- Electron に依らない判定・組み立ては別のファイルに分けてテストする（`app/urls.ts`・`ipc/register.ts` など）。
- メインはログインシェルの PATH を読まない（読むのはコア）。
- CDP のポートは `KICKOFF_REMOTE_DEBUG` のときだけ開く。`KICKOFF_USER_DATA_DIR` は開発時だけ見る（`measureDataDir`。製品版の DB を読まない）。

## 終了
- 片付けは `app/shutdown.ts` の `registerShutdown` 1 か所（子の Electron → コアの `close` → `exitKeepingNotifications`。順と理由はその JSDoc）。
- メインはコアのプロセスを直接止めない（RPC の `close` を頼んで待つ）。`reallyExit` は後片付けを飛ばすので、コアを必ず先に終わらせる。`app.quit()` を呼び直さない。
- 子の Electron はメインプロセスにだけ先に SIGTERM を送る（`app/childApps.ts`。シェルを先に止めると開発版の localStorage が消える）。

## IPC
- 取り決めは土台の `FOUNDATION_IPC` と機能の `@shared/<機能>/ipc.ts` を並べた `@/app/shared/ipc.ts` の `NATIVE_API`（`src/shared/CLAUDE.md` の「IPC の取り決め」）。登録は `ipc/register.ts` を通す（送り手と引数の zod をそこで確かめ、処理で繰り返さない）。
- 画面から届いたパスは信じない（解決してから比べる）。足すときは表 → 引数の形（土台は `ipc/args.ts`、機能は `desktop/ipcArgs.ts`。末尾の `Same` で表と比べる）→ 処理の順。

## 画面のセッションと権限
- 子のプロセスは `utilityProcess` で起動する。`ELECTRON_RUN_AS_NODE` の形を足さない（製品版は fuses で切る。`electron-builder.yml`）。
- DB ワーカーはメインが起動し、コアと `MessageChannelMain` で直結する（話はメインを通らない）。
- キーチェーンの鍵（`app/secretCipher.ts`）は非同期の口で、初めて使うときに取る。マイクはアプリ自身の画面だけ許す（`app/mediaPermission.ts`）。

## ウィンドウ・外のアプリ
- 窓は `app/window.ts`（窓がなければ `showMainWindow` が作り直す）、外のアプリは `app/externalApps.ts`、選ぶ窓は `app/dialogs.ts`。
- 窓の地の色は画面のテーマに合わせる（`app/appearance.ts`。メインは localStorage を読めない）。

## ターミナル・眠らせない・通知
- シェルはコア（`src/features/terminal/CLAUDE.md`）。メインは消えた画面のシェルをコアに止めさせるだけ（`terminal/terminals.ts`）。
- 眠らせない決まりは `app/keepAwakeRules.ts`。ログイン時に起動は OS の設定を読み、DB に持たない（開発版は切り替えない）。
- 通知の要否と文はコア（`src/features/notifications/CLAUDE.md`）。メインは知らせ `notify` で出すだけ。

## コアのプロセス（`app/coreProcess.ts`）
- RPC の形は `@/foundation/core/host/protocol.ts`（機能の分は `@/app/core/hostRemote.ts` が declare module で足す）。写しは `prefixedClient`・`prefixedHandlers`、時間の上限は `RPC_TIMEOUTS`。HTTP・SSE・WebSocket は画面からコアへ直接。
- 落ちたら残った子を止めてから作り直す（古い子が書いている間に再開すると食い違う。`leftovers.ts`）。様子の移り変わりは `coreState.ts` の `coreStateAfter` だけで決める。
- コンパイルキャッシュ（`app/compileCache.ts`）を `~/Library/Caches` に置かない（AI の砂場が書ける）。

## 起動の記録・製品版の画面の配信
- 起動の記録は `app/startupLog.ts`、画面が応答しないときは `app/hangWatch.ts`。
- 製品版の画面はコアが配る（`@/foundation/core/http/rendererCache.ts`）。`src/app/renderer/public/assets/` に置かない（ハッシュのない名前はビルドが落とす）。
