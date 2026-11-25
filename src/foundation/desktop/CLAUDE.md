# メインプロセスの土台（`src/foundation/desktop`）

Electron のメインプロセスと preload の土台。窓・OS の口・仲立ちだけを持ち、コアは別のプロセス（`utilityProcess`）で動かす（メインの糸は画面の入力の道でもあるので重さを乗せない）。入口は `src/app/desktop/`（起動の順と理由は `index.ts` のコメント）。

## 口の一覧
- `parts.ts`（`DesktopPart`。土台は `foundationPart.ts`、機能は各機能の `desktop/index.ts`。app が `mergeParts` で並べる）
- `app/`: 窓 `window.ts`（`createAppWindow`・`showMainWindow`）・別ウィンドウ `popouts.ts`（`POPOUT_KINDS`）・終了 `shutdown.ts`・コアのプロセス `coreProcess.ts`（様子は `coreState.ts`）・子の Electron `childApps.ts`・外のアプリ `externalApps.ts`・窓の守り `windowGuard.ts`・眠らせない `keepAwakeRules.ts`・鍵 `secretCipher.ts`・許可 `mediaPermission.ts`・起動の記録 `startupLog.ts`・`bootRecorder.ts`・詰まり `stalls.ts`・通知 `notifications.ts`・Dock のアイコン `dockIcon.ts`・`hangWatch.ts`
- `ipc/`: 登録 `register.ts`・引数の zod `args.ts`。表は土台の `FOUNDATION_IPC` と機能の `@shared/<機能>/ipc.ts`（並べるのは `@/app/shared/ipc.ts`）
- `platform/`（`hostPlatform`・`desktopPlatform`）・`terminal/`・URL の判定 `urls.ts`

## 決まり
- IPC は登録 `register.ts` を通す（送り手と引数の zod をそこで確かめる）。チャンネル名は手書きしない。足すときは表 → 引数の形（機能は `desktop/ipcArgs.ts`。末尾の `Same` で表と比べる）→ 処理の順。
- `src/shared/foundation/ipc` と機能の `ipc.ts` は zod を読まない（preload の砂場に束ねる）。値は種類だけを持つ（型の引数は必ず書く）。
- 画面から届いたパスは信じない（解決してから比べる）。
- 外のページは IPC の `externalApps.openWebUrl`（URL を読み直し、http(s) だけ）でだけ開く。アプリの窓の新しいウィンドウの要求は断るだけ（`denyNewWindows`）。
- アプリの窓はアプリの出どころ（開発版は dev サーバー）の外へ移らせない（`guardAppNavigation`。枠の中も）。許可（`mediaPermission.ts`）もアプリの出どころにだけ出す。
- メインはログインシェルの PATH・localStorage・SQL を読まない（窓の地の色はテーマを画面から受ける）。通知の要否と文・シェルはコア。
- 画面が読み込み直される・落ちる・閉じるときに、持ち物（Dock のアイコン・内蔵ターミナルなど）を片付けるには `createRendererLifetimeWatcher` を使う。
- OS ごとの処理は `platform/` の口に集める（DB ワーカーのシェルの口はワーカーの入口が選ぶ。OS を足すときは両方）。Electron に依らない判定は別のファイルに分けてテストする。
- 子のプロセスは `utilityProcess` で起動する（`ELECTRON_RUN_AS_NODE` の形を足さない。製品版は fuses で切る）。DB ワーカーはコアと `MessageChannelMain` で直結する。
- CDP は `KICKOFF_REMOTE_DEBUG` のときだけ開く。`KICKOFF_USER_DATA_DIR` は開発時だけ見る（製品版の DB を読まない）。ログイン時に起動は OS の設定を読む（DB に持たない）。

## 落とし穴
- メインはコアのプロセスを直接止めない（RPC の `close` を頼んで待つ）。片付けは `registerShutdown` 1 か所（子の Electron → コアの `close` → 終了）。`reallyExit` は後片付けを飛ばすのでコアを必ず先に終わらせる。`app.quit()` を呼び直さない。
- 機能が渡す終了時のファイル片付けは、終了が確定したあとだけ始め、子・コアの片付けと同じ待ち時間の上限に収める。
- 子の Electron のアプリを先に止める。止めるのはメインプロセスにだけ SIGTERM（シェルを先に止めると開発版の localStorage が消える）。
- コアが落ちたら残った子を止めてから作り直す（古い子が書いている間に再開すると食い違う。`leftovers.ts`）。
- RPC の形は `@/foundation/core/host/protocol.ts`（機能の分は `@/app/core/hostRemote.ts` が declare module で足す。時間の上限 `RPC_TIMEOUTS`）。HTTP・SSE・WebSocket は画面からコアへ直接。
- メインのウィンドウの最小は 721×480（窓を並べるアプリの 4 分割に収める）。幅 720px 以下は縦 1 列の画面（スマホ向け）になるので、最小をそこまで下げない。
- コンパイルキャッシュを `~/Library/Caches` に置かない（AI の砂場が書ける）。
- 製品版の画面はコアが配る（`@/foundation/core/http/rendererCache.ts`）。`src/app/renderer/public/assets/` に置かない。
- テスト: `app/*.test.ts`・`ipc/*.test.ts`。
