# メインプロセス（src/main）の説明

Electron のメインプロセス。コア（`src/core`）を同じプロセスで起動し、画面には最小限のネイティブ機能（IPC）だけを出す。

## 構成と起動

- `index.ts` は起動の順番だけを書く: 名前・保存先・ポートを決めて起動の記録を始める（`app/environment.ts` の `setupEnvironment`）→ 開発のデータがなければ製品版から一度だけ写す（`seedDevDataOnce`）→ 埋め込みブラウザの安全設定（`hardenWebviews`。ウィンドウを作る前）→ 1 つだけ起動（2 つ目は、いまのウィンドウを前に出して終わる）→ 準備ができたら、ログインシェルの PATH → コア（`startCore`。開発時は electron-vite の dev サーバーが画面を配り、製品版はコアが配る）→ 画面のセッション（`prepareAppSession`）→ IPC（`registerIpc`）→ メニュー（`setAppMenu`）→ ウィンドウ（`openMainWindow`）。
- 中身はフォルダごと: `app/`（環境・ウィンドウ・メニュー・終了の片付け・子の Electron・画面のセッションと権限・ダイアログ・外のアプリで開く・別ウィンドウ（`popouts.ts`。IPC の `windows.openPopout` / `focusMain`。画面のチャットの右の欄の中身を同じ画面の URL のハッシュで開き、同じものは前に出す）・起動の記録・ログの場所）/ `ipc/`（登録と引数の形）/ `browser/`（埋め込みブラウザ）/ `terminal/`（内蔵ターミナル）/ `notifications/`（Mac の通知）/ `diagnostics/`（性能の記録）。
- Electron に依らない判定・組み立ては別のファイルに分けてテストする（`app/urls.ts`・`app/openCommands.ts`・`app/mediaPermission.ts`・`app/childApps.ts` の `descendantElectronMains`・`ipc/register.ts`・`ipc/args.ts`・`notifications/notificationIds.ts`・`terminal/output.ts`・`browser/extensionDirs.ts`・`browser/crx.ts`・`diagnostics/profileSummary.ts`・`diagnostics/rendererTiming.ts`）。
- 開発版は `KICKOFF_REMOTE_DEBUG=<port>` のときだけ CDP のポートを開く（製品版では開かない）。

## 終了

- 終了時の片付けは `app/shutdown.ts` の `registerShutdown`: `before-quit` で `preventDefault` → 自分から起動した Electron のアプリ（`stopChildElectronApps`。3 秒まで）→ ターミナル（`killAllTerminals`）→ コア（`core.close()`）→ `app.exit(0)`。片付けは 5 秒で打ち切る。`app.quit()` を呼び直さない（ウィンドウを閉じたところで終了が取り消され、アプリが残る）。
- 子の Electron（`app/childApps.ts`）: 製品版の内蔵ターミナル・エージェントから起動した開発版などは、製品版の子孫になる。終わるときは、そのメインプロセスにだけ先に SIGTERM を送り、終わるのを待つ。シェルやエージェントを先に止めると、開発版が Helper ごといきなり止められ、localStorage が消えるため。
- コアの HTTP サーバーは `core/http/httpServer.ts` の `stopHttpServer` で止める（開いたままの SSE の接続もすべて切る。切らないと close が終わらず、終了まで止まる）。

## IPC

- 取り決めは `@shared/ipc` の `NATIVE_API` 1 か所（まとまり → 名前 → 種類と引数・戻り値の型。`src/shared/CLAUDE.md`）。チャンネル名は `channelOf` で作り、手書きしない。preload（`src/preload/nativeApi.ts` の `createNativeApi`）はこの表から `window.kickoff` を作る。
- メインは `ipc/ipc.ts` の `registerIpc` で、まとまりごとの処理（`IpcHandlers["terminal"]` の型で、その機能のフォルダに置く: `dialogHandlers`・`externalAppHandlers`・`devtoolsHandlers`・`browserExtensionHandlers`・`terminalHandlers`・`notificationHandlers()`・`diagnosticsHandlers`）を `ipc/register.ts` の `registerIpcHandlers` に渡す。登録の補助がすべて同じ扱いにする: 送り手が Kickoff の画面か（`fromApp(appUrl)`。画面を読み込んだ URL と同じ出どころの枠か）を確かめ、引数を zod（`ipc/args.ts` の `IPC_ARGS`）で確かめ、通したものだけを処理に渡す。断ったら書き残し、invoke は `IpcRejected` で失敗させ、send は捨てる（送り手と形の確かめはここだけで、処理では繰り返さない）。
- 引数の形は `defineArgSchemas` で定め、取り決めの引数と形が違えば typecheck で分かる。形だけを確かめる（ファイルがあるか・範囲に丸めるなどは処理で行う）。画面から届いたパスは信じない（消すフォルダなどは解決してから比べる）。
- メインから画面への知らせは `sendEvent(webContents, group, method, ...args)`（画面がない・閉じていれば何もしない）。
- 足すときは `NATIVE_API` → `IPC_ARGS` → 処理の順（どれかが欠ければ typecheck で分かる）。

## 画面のセッションと権限

- `app/appSession.ts` の `prepareAppSession`: 画面（defaultSession）に認証の Cookie を置き（トークンを画面のコードに渡さない）、マイクの許可の答え方を登録する。
- `app/mediaPermission.ts`: マイクはアプリ自身の画面からの音声だけ許し、カメラ・ほかの出どころは断る。media 以外は Electron の既定どおり許す（通知・クリップボードなどを壊さない）。判定は純粋関数（`permissionAllowed` / `permissionCheckAllowed`）でテストする。埋め込みブラウザは別のセッションなので広げない。
- 製品版で macOS がマイクの許可を聞けるよう、`electron-builder.yml` の `mac.extendInfo` に `NSMicrophoneUsageDescription` を置く（hardened runtime を使わないので entitlement は要らない）。

## ウィンドウ・外のアプリ

- `app/window.ts`: メインのウィンドウ（`contextIsolation`・`sandbox`・`nodeIntegration: false`・`webviewTag`）。Mac ではウィンドウを閉じてもアプリは残り、Dock を押すと作り直す。新しいウィンドウを開こうとしたら、http(s) のページだけ既定のブラウザで開く（`app/externalLinks.ts` の `openLinksExternally`。埋め込みブラウザの中のリンクも同じ）。
- 外のアプリで開く（`app/externalApps.ts`）: 命令の組み立ては `app/openCommands.ts`（外部のターミナル・ブラウザの `open` の引数 `externalTerminalArgs` / `externalBrowserArgs`（ページは http(s) だけ）・入っているアプリ `installedTerminals` / `installedBrowsers`・VS Code の URL `vscodeFileUrl`（パスは区切りごとに符号化する。`#` `?` を含むパスも開けるように））。アプリの一覧は `@shared/ipc` の `EXTERNAL_TERMINALS` / `EXTERNAL_BROWSERS`。
- フォルダ・ファイルの選択は `app/dialogs.ts` の `pickPaths`。

## 埋め込みブラウザ（browser/）

- `browser.ts` の `hardenWebviews`: 表示するページは信頼しない外部のものとして扱う（Node を使わせない・preload を差し込ませない・http(s) と空のページだけ・専用のセッション）。
- `devtools.ts`: 開発者ツールは、右・下はタブの中のもう 1 つの webview に（`setDevToolsWebContents`）、別のウィンドウはこちらで作ったウィンドウに出す。どちらも、頼んできた画面の中の webview に限る。どこに出しているかは画面の側で持ち、Electron の devtools-opened / closed の知らせには頼らない（遅れて届く）。利用者が別のウィンドウを閉じたら `devtools.onWindowClosed` で知らせる。
- `extensions.ts`: 拡張機能（React DevTools など。ウェブストアから取る・Chrome から写す・展開済みのフォルダを読む）。Electron は毎回の読み込みが要るので、起動のたびに `loadSavedExtensions`。外すときに消してよいのは、保存先のすぐ下のフォルダだけ（`extensionDirs.ts` の `isManagedExtensionDir`）。`.crx` は `crx.ts` で展開する。

## ターミナル（terminal/）

- `terminals.ts`: シェルは node-pty でメインプロセスが動かし、画面とは IPC だけでつなぐ（コアのサーバー、つまりスマホからは通さない）。画面の部品は作り直されるので、シェルはキーごとに動かし続け、つなぎ直したら（`terminal.open`）いまの画面の内容を返す。その画面が消えた・読み込み直したら、その画面のシェルを止める。作業場所のフォルダがなければホームで開き、その注意を画面の先頭に出す。シェルには `KICKOFF_TERMINAL_OF`（製品版 / 開発版）を渡す（`npm run install-app` が、製品版のターミナルから流されたのを見分ける）。
- `output.ts` の `TerminalOutput`: 出力は裏の端末（`@xterm/headless`）にも書き、つなぎ直したときの内容（`snapshot`）にする。画面へは細かい出力をまとめて送る。画面は open の返事までの出力を捨てるので、snapshot は書き終えるのを待ってから取り、取っている間の出力は返事のあとに送る（漏れも重なりも出さない）。

## 通知（notifications/）

- Mac の通知はメインプロセスの `Notification` で出す（画面の通知は、画面を読み込み直す・終えると通知センターから消え、届かなかった理由も分からないため）。参照をなくした通知も通知センターから消えるので、新しいものから 50 件の参照を持つ。
- 通知の ID にチャットを埋め込み（`notificationIds.ts` の `notificationIdOf` / `chatOfNotificationId`。毎回変える）、起動したら `Notification.getHistory()` で通知センターに残っているものにも押したときの処理を付け直す。押したら Kickoff を前に出し、`notifications.onOpenChat` で画面にそのチャットを開かせる。
- 画面からは `notifications.notify`（結果は `{ ok }` か `{ ok: false, error }`）・`notifications.openSettings`（Mac の「システム設定 → 通知」）。

## 性能の記録（diagnostics/）

- 重いときに再起動せず、その場で取る（ヘルプのメニュー・設定の「診断」→ `diagnostics.start`）。`diagnostics.ts` の `startDiagnostics` が自分の画面に `webContents.debugger` をつなぎ、10 秒（`DIAGNOSTICS_SECONDS`）の CPU プロファイル・画面の要素の数・メモリ（GC のあと・外れたままのノードの目安）・1 秒あたりの処理の時間・操作の遅れと長いフレーム（画面で評価する式とまとめる純粋関数は `rendererTiming.ts`）と、メインプロセスの分（`mainProcess.ts` の `startMainRecording`: CPU プロファイル・イベントループの遅れ・コアが画面へ送った知らせの数と量・SSE の数・DB の様子（`Core.databaseStats()`。メインは SQL を流さない））・プロセスごとの CPU とメモリを集める。デバッグ用のポートは開かない。
- 保存先はログの場所（`app/logs.ts` の `logsDir()`）の `diagnostics/<日時>/` で、`summary.json`・`profile.cpuprofile`（画面）・`main.cpuprofile`（どちらも Chrome の開発者ツールで開ける）。データの保存先（Application Support）はエージェントから読めない（`chat/guard/selfProtection.ts`）ので、場所を貼っても読めるようログの場所に置く。以前の保存先の記録は、起動のときに `moveLegacyDiagnostics` で移す。
- 様子は `diagnostics.onState` で画面に知らせる（記録の間も操作を続けられるよう、ダイアログにしない）。保存先と最近の記録は `diagnostics.folders`、Finder で開くのは `diagnostics.openRoot`（メニューの「保存先を開く」と共通）。集計は `profileSummary.ts` / `rendererTiming.ts` でテストする。

## 起動の記録

- `app/startupLog.ts`: `~/Library/Logs/<アプリ名>/startup.log` に、起動の各段階（whenReady・ログインシェルの PATH・コア・認証の Cookie）と、メインのウィンドウの画面の読み込み（読み込みの各段階・失敗・画面のプロセスの異常終了・応答なし・preload のエラー・画面の console.error・10 秒たっても終わらない）・子プロセスの異常終了を書く。512KB を超えたら 1 世代だけ残す。`npm run install-app` で入れ替えた直後の初回だけ画面が出ないことがあり、macOS の記録では画面の中で何が起きたか分からなかったため。エージェントも読める場所に置く。

## 製品版の画面の配信

- 製品版の画面はコア（`core/http/server.ts`）が配る。画面のファイルは `Cache-Control: no-cache` で返す（serveStatic は Last-Modified だけを付けるので、そのままだと Chromium が経験則でキャッシュを新しいとみなし、アプリを入れ替えたあとの起動で古い index.html・JS を問い合わせずに使い、新しいコアとかみ合わずに画面が真っ暗になった）。SPA の index.html を返すのは拡張子のないパスだけで、ない JS・CSS は 404。
- `npm run install-app` は製品版を終了させ、Helper の終わりも待ってから、画面の HTTP キャッシュ（保存先の `Cache`。チャット・localStorage は別）を消して入れ替える。
