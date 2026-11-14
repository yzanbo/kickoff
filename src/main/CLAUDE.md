# メインプロセス（src/main）の説明

Electron のメインプロセス。コア（`src/core`）を同じプロセスで起動し、画面には最小限のネイティブ機能（IPC）だけを出す。

## 構成と起動

- `index.ts` は起動の順番だけを書く: 名前・保存先・ポートを決めて起動の記録を始める（`app/environment.ts` の `setupEnvironment`）→ 開発のデータがなければ製品版から一度だけ写す（`seedDevDataOnce`）→ 埋め込みブラウザの安全設定（`hardenWebviews`。ウィンドウを作る前）と、AI が読むコンソールの出力の記録（`watchWebviewConsoles`）→ 1 つだけ起動（2 つ目は、いまのウィンドウを前に出して終わる）→ 準備ができたら、ログインシェルの PATH（OS の口の `loadLoginShellPath`）→ コア（`startCore`。開発時は electron-vite の dev サーバーが画面を配り、製品版はコアが配る。OS の口 `hostPlatform`（音声入力の「macOS の音声認識」の補助コマンドの場所 `SPEECH_HELPER` も入れたもの）と、AI のブラウザ操作 `agentBrowser`、DB ワーカーを起動する口 `dbWorker` も渡す）→ 画面のセッション（`prepareAppSession`）→ IPC（`registerIpc`）→ メニュー（`setAppMenu`）→ ウィンドウ（`openMainWindow`）。
- OS ごとに違う処理は `platform/` の口に集める（使う所に OS のコマンド・パスを散らさない）: コアと共通の口 `hostPlatform`（`src/core/platform` の `HostPlatform`）と、メインだけの口 `desktopPlatform`（`platform/types.ts` の `DesktopPlatform`: 入っている外部のターミナル・ブラウザとその開き方・内蔵ターミナルのシェル・開発中の Electron のメインプロセスの見分け）を `platform/index.ts` の 1 か所で選ぶ（いまは macOS だけ。中身は `platform/macos/`）。`window-all-closed` の OS の見分けは Electron の決まりの書き方なのでそのまま。
- 中身はフォルダごと: `app/`（環境・ウィンドウ・メニュー・終了の片付け・子の Electron・画面のセッションと権限・ダイアログ・外のアプリで開く・別ウィンドウ（`popouts.ts`。IPC の `windows.openPopout` / `focusMain` / `closeSelf`。画面のチャットの右の欄の中身と子チャットを同じ画面の URL のハッシュで開き、同じものは前に出す。子チャットのウィンドウは最小化で閉じ、✕ は止めて `onCloseRequested` で画面に閉じ方を聞かせる）・起動の記録・ログの場所）/ `ipc/`（登録と引数の形）/ `browser/`（埋め込みブラウザ）/ `terminal/`（内蔵ターミナル）/ `notifications/`（Mac の通知）/ `diagnostics/`（性能の記録）。
- Electron に依らない判定・組み立ては別のファイルに分けてテストする（`app/urls.ts`・`app/openCommands.ts`・`platform/macos/openCommands.ts`・`app/mediaPermission.ts`・`app/childApps.ts` の `descendantElectronMains`・`ipc/register.ts`・`ipc/args.ts`・`notifications/notificationIds.ts`・`terminal/output.ts`・`browser/extensionDirs.ts`・`browser/crx.ts`・`browser/keys.ts`・`browser/flatten.ts`・`diagnostics/profileSummary.ts`・`diagnostics/rendererTiming.ts`）。
- 開発版は `KICKOFF_REMOTE_DEBUG=<port>` のときだけ CDP のポートを開く（製品版では開かない）。このときは、隠れた窓でもタイマー・描画・アニメーションを止めない（Chromium の `disable-background-timer-throttling` など。確かめるときは開発版の窓を前に出さないので、止まると、なめらかなスクロールなどの動きを外から確かめられない）。

## 終了

- 終了時の片付けは `app/shutdown.ts` の `registerShutdown`: `before-quit` で `preventDefault` → 自分から起動した Electron のアプリ（`stopChildElectronApps`。3 秒まで）→ ターミナル（`killAllTerminals`）→ コア（`core.close()`）→ 終える（`exitKeepingNotifications`）。片付けは 5 秒で打ち切る。`app.quit()` を呼び直さない（ウィンドウを閉じたところで終了が取り消され、アプリが残る）。
- 最後は `app.exit()` を使わず、localStorage（`flushStorageData`）と Cookie（`cookies.flushStore`）を書き出してから `process.reallyExit(0)` で Electron の後片付けを通らずに終える。`app.exit()` で普通に終わると、Electron が後片付けで、この起動で出した通知を通知センターからすべて消すため（残す手立ては公開されていない。異常終了した起動の通知だけが残っていた）。`flushStorageData` は書き終わりを知らせないので、少し待ってから終える。DB などの片付けは、その前の `core.close()` で済ませる。
- 子の Electron（`app/childApps.ts`。プロセスの表と、開発中の Electron のメインプロセスの見分けは OS の口から受ける）: 製品版の内蔵ターミナル・エージェントから起動した開発版などは、製品版の子孫になる。終わるときは、そのメインプロセスにだけ先に SIGTERM を送り、終わるのを待つ。シェルやエージェントを先に止めると、開発版が Helper ごといきなり止められ、localStorage が消えるため。
- コアの HTTP サーバーは `core/http/httpServer.ts` の `stopHttpServer` で止める（開いたままの SSE の接続もすべて切る。切らないと close が終わらず、終了まで止まる）。

## IPC

- 取り決めは `@shared/ipc` の `NATIVE_API` 1 か所（まとまり → 名前 → 種類と引数・戻り値の型。`src/shared/CLAUDE.md`）。チャンネル名は `channelOf` で作り、手書きしない。preload（`src/preload/nativeApi.ts` の `createNativeApi`）はこの表から `window.kickoff` を作る。
- メインは `ipc/ipc.ts` の `registerIpc` で、まとまりごとの処理（`IpcHandlers["terminal"]` の型で、その機能のフォルダに置く: `dialogHandlers`・`externalAppHandlers`・`devtoolsHandlers`・`agentBrowserHandlers`・`browserExtensionHandlers`・`terminalHandlers`・`notificationHandlers()`・`diagnosticsHandlers`）を `ipc/register.ts` の `registerIpcHandlers` に渡す。登録の補助がすべて同じ扱いにする: 送り手が Kickoff の画面か（`fromApp(appUrl)`。画面を読み込んだ URL と同じ出どころの枠か）を確かめ、引数を zod（`ipc/args.ts` の `IPC_ARGS`）で確かめ、通したものだけを処理に渡す。断ったら書き残し、invoke は `IpcRejected` で失敗させ、send は捨てる（送り手と形の確かめはここだけで、処理では繰り返さない）。
- 引数の形は `defineArgSchemas` で定め、取り決めの引数と形が違えば typecheck で分かる。形だけを確かめる（ファイルがあるか・範囲に丸めるなどは処理で行う）。画面から届いたパスは信じない（消すフォルダなどは解決してから比べる）。
- メインから画面への知らせは `sendEvent(webContents, group, method, ...args)`（画面がない・閉じていれば何もしない）。
- 足すときは `NATIVE_API` → `IPC_ARGS` → 処理の順（どれかが欠ければ typecheck で分かる）。

## 画面のセッションと権限

- DB ワーカー（`app/dbWorker.ts` の `utilityWorker`）: コアの DB クライアントが DB に触る別のプロセスを、Electron の `utilityProcess` でビルドの `out/main/dbWorker.js`（`app/environment.ts` の `DB_WORKER_FILE`）から起動し、コアの `WorkerChannel` の形でつなぐ。前の「自分の実行ファイルを `ELECTRON_RUN_AS_NODE` で Node として fork する」形は使わない（製品版は Electron の fuses で RunAsNode をオフにするため。AI が Bash から Kickoff 本人として JavaScript を動かし、キーチェーンの鍵を受け取れないように）。`utilityProcess` は自分のプロセスグループを持てないので、ワーカーが起動した ssh・シェルはワーカーが pid を知らせ、コアの `DbWorkerClient` が止める。
- DB のパスワードの暗号化の口（`app/secretCipher.ts` の `safeStorageCipher`）: Electron の `safeStorage` の非同期の口（`encryptStringAsync` / `decryptStringAsync`。キーチェーンの許可の画面が出ている間もメインプロセスを止めない）をコアの `startCore({ secretCipher })` に渡す。鍵（キーチェーンの「<アプリ名> Safe Storage」）は初めて暗号化・復号するときに取りに行き、起動のときには触らない（DB を使わない人が、入れ替えのたびに許可を聞かれないように）。
- `app/appSession.ts` の `prepareAppSession`: 画面（defaultSession）に認証の Cookie を置き（トークンを画面のコードに渡さない）、マイクの許可の答え方を登録する。
- `app/mediaPermission.ts`: マイクはアプリ自身の画面からの音声だけ許し、カメラ・ほかの出どころは断る。media 以外は Electron の既定どおり許す（通知・クリップボードなどを壊さない）。判定は純粋関数（`permissionAllowed` / `permissionCheckAllowed`）でテストする。埋め込みブラウザは別のセッションなので広げない。
- 製品版には `electron-builder.yml` の `electronFuses` で Electron の fuses を入れる（RunAsNode・Node の inspect の引数・`NODE_OPTIONS` をオフ、asar だけから読む・asar の改ざんの確かめをオン、Cookie の暗号化はオフのまま）。DB のパスワードを暗号化しているキーチェーンの鍵を、AI が Bash から Kickoff 本人として JavaScript を動かして受け取れないようにするため（要件 5.12）。作った製品版にだけ効き、開発版には効かない。`process.execPath` を Node として起動する形（`ELECTRON_RUN_AS_NODE`）を足さない（子のプロセスは `utilityProcess` で）。確かめは `node node_modules/@electron/fuses/dist/bin.js read --app <作った .app>`。署名は仮の署名（ad-hoc）のままで、自分用の証明書は作らない（理由は `electron-builder.yml` の `mac.identity` のコメント）。
- 製品版で macOS がマイクの許可を聞けるよう、`electron-builder.yml` の `mac.extendInfo` に `NSMicrophoneUsageDescription` を置く（hardened runtime を使わないので entitlement は要らない）。
- 音声入力の「macOS の音声認識」の補助コマンド `kickoff-speech`（Swift。ソースは `native/kickoff-speech/main.swift`）は、メインプロセスのビルドの始めに `scripts/speech-helper.ts` の差し込み（`electron.vite.config.ts`）が `swiftc` で `out/native/kickoff-speech` に作る（ソースより新しければ作らない。Swift のコンパイラがないなどで作れなくても、警告を出してビルドは続ける。その Kickoff では「macOS の音声認識」が選べないだけ）。古い macOS でも起動して「使えない」と答えられるよう、対象の版は macOS 12 にして、新しい API は実行のときに確かめて使う。場所は `app/environment.ts` の `SPEECH_HELPER`（実行ファイルは asar の中からは動かせないので、`electron-builder.yml` の `asarUnpack` に `out/native/**` を足し、製品版では `app.asar.unpacked` の下を指す）。呼ぶのはコア（`src/core/CLAUDE.md` の「音声入力」）。

## ウィンドウ・外のアプリ

- `app/window.ts`: メインのウィンドウ（`contextIsolation`・`sandbox`・`nodeIntegration: false`・`webviewTag`）。Mac ではウィンドウを閉じてもアプリは残り、Dock を押すと作り直す。新しいウィンドウを開こうとしたら、http(s) のページだけ既定のブラウザで開く（`app/externalLinks.ts` の `openLinksExternally`。埋め込みブラウザの中のリンクも同じ）。
- 外のアプリで開く（`app/externalApps.ts`）: 外部のターミナル・ブラウザは OS の口（`desktopPlatform`）。macOS の中身は `platform/macos/openCommands.ts`（`open` の引数 `externalTerminalArgs` / `externalBrowserArgs`（ページは http(s) だけ）・入っているアプリ `installedTerminals` / `installedBrowsers`）。OS に依らないもの（開くフォルダの確かめ `existingFolder`・VS Code の URL `vscodeFileUrl`（パスは区切りごとに符号化する。`#` `?` を含むパスも開けるように））は `app/openCommands.ts`。アプリの一覧は `@shared/ipc` の `EXTERNAL_TERMINALS` / `EXTERNAL_BROWSERS`。
- フォルダ・ファイルの選択は `app/dialogs.ts` の `pickPaths`。macOS の窓は題（`title`）を出さないので、フォルダを選ぶ `pickFolder` は何のために選ぶかを窓の上の文（`message`。省けば題と同じ）と決めるボタンの名前（`buttonLabel`）で伝え、初めに開くフォルダ（`defaultPath`）も渡せる（`PickFolderOptions`）。

## 埋め込みブラウザ（browser/）

- `browser.ts` の `hardenWebviews`: 表示するページは信頼しない外部のものとして扱う（Node を使わせない・preload を差し込ませない・http(s) と空のページだけ・専用のセッション）。
- `devtools.ts`: 開発者ツールは、右・下はタブの中のもう 1 つの webview に（`setDevToolsWebContents`）、別のウィンドウはこちらで作ったウィンドウに出す。どちらも、頼んできた画面の中の webview に限る。どこに出しているかは画面の側で持ち、Electron の devtools-opened / closed の知らせには頼らない（遅れて届く）。利用者が別のウィンドウを閉じたら `devtools.onWindowClosed` で知らせる。
- `agentBrowser.ts` の `agentBrowser`: AI（チャットのエージェント）に埋め込みブラウザを操作させる、コアの `BrowserControl` の実装（ツールは `core/providers/claude/browserTools.ts`）。画面のブラウザのタブは、webview の準備ができたら IPC の `agentBrowser.register`（WebContents の ID・タブのキー・プロジェクト）で登録し、頼んできた画面の中の webview に限る（`devtools.ts` の `isOurWebview`）。AI が新しいタブを開くときは画面に `onOpenRequest` で頼み、足したタブのキーを `opened` で受け取って、その webview の登録を待つ。表に出す頼み（開くときの `reveal`・既存のタブの `reveal`）は、画面に `onOpenRequest` の引数・`onRevealRequest` で頼んで `opened` / `revealed` で表に出したかを受け（3 秒で答えがなければ出さなかったことにする）、出したらページの大きさが 2 回続けて同じになるまで待つ（`settledLayout`。閉じた欄の見えない並びから開いた欄へ変わるため）。前に表に出したタブ `after` がもう閉じていれば、利用者は見ていないので頼まない。操作したタブは `onActivity` で画面に知らせ（最後の操作から 30 秒で消す）、画面がタブに「AI 操作中」の印を出し、表に出ていないタブも見えない形で並べる（大きさがないと撮れず、位置で押せない。並ぶまで `laidOut` で待つ）。ページの中で動かす文は `pageScripts.ts`（読み取りで押せる要素に `data-kickoff-ref` の番号を付け、押す・打つはその番号で探す）。押すは要素を真ん中までスクロールし、その位置が要素なら `sendInputEvent` のマウスで押す（覆われていれば JavaScript の `click()`）。打つは値の setter を通して input・change を起こす（React の入力欄にも届く）。送るはフォームの `requestSubmit`、フォームがなければ Enter。キーの名前は `keys.ts` の `browserKeyCode`。撮るは `capturePage` を幅 1280px までに縮め、透明なところを白で埋めて（`flatten.ts`。背景を決めていないページが黒く写るため）JPEG にする（`shoot`）。コンソールの出力は webview ができたときから `webviewConsole.ts` が 200 件まで、出たときのページの URL と時刻と一緒に覚える（登録はページの準備のあとなので、そこからだと読み込み中の出力を取りこぼす。AI の browser_console には前と同じ形の文 `webviewConsoleOf`）。画面のタブの「AI に渡す」は IPC の `agentBrowser.handOffCapture`（WebContents の ID。頼んだ画面の中の webview だけ）で、同じ撮り方の画面と、覚えている出力のうちエラー・警告（`webviewProblemsOf`。URL 付き）を返す（撮れなくてもコンソールは返し、理由を添える）。
- `extensions.ts`: 拡張機能（React DevTools など。ウェブストアから取る・Chrome から写す・展開済みのフォルダを読む）。Electron は毎回の読み込みが要るので、起動のたびに `loadSavedExtensions`。外すときに消してよいのは、保存先のすぐ下のフォルダだけ（`extensionDirs.ts` の `isManagedExtensionDir`）。`.crx` は `crx.ts` で展開する。

## ターミナル（terminal/）

- `terminals.ts`: シェルは node-pty でメインプロセスが動かし、画面とは IPC だけでつなぐ（コアのサーバー、つまりスマホからは通さない）。画面の部品は作り直されるので、シェルはキーごとに動かし続け、つなぎ直したら（`terminal.open`）いまの画面の内容を返す。その画面が消えた・読み込み直したら、その画面のシェルを止める。作業場所のフォルダがなければホームで開き、その注意を画面の先頭に出す。シェルと引数は OS の口（`desktopPlatform.terminalShell`。macOS は `$SHELL` のログインシェル）。`open` の `start`（`@shared/ipc` の `TerminalStart`）にコマンドがあれば、そのコマンドだけを流すシェル（macOS は `-l -c <コマンド>`）で始め（`env` も足す）、終わったら `onExit` で終了コードを知らせる（新しく始めるときだけ使う）。シェルには `KICKOFF_TERMINAL_OF`（製品版 / 開発版）を渡す（`npm run install-app` が、製品版のターミナルから流されたのを見分ける）。作業場所がポートの帯を持つワークツリーの中なら、その開発サーバーの番号 `PORT`（コアの `worktreeEnvFor`。`index.ts` がコアを起動したあと `setTerminalEnvOf` で渡す。`src/core/CLAUDE.md` の「ワークツリーの実行環境」）も渡す。
- `output.ts` の `TerminalOutput`: 出力は裏の端末（`@xterm/headless`）にも書き、つなぎ直したときの内容（`snapshot`）にする。画面へは細かい出力をまとめて送る。画面は open の返事までの出力を捨てるので、snapshot は書き終えるのを待ってから取り、取っている間の出力は返事のあとに送る（漏れも重なりも出さない）。AI が読む最後の行は `tail`（書き終えるのを待ってから、裏の端末の行を折り返しをつないだ 1 行ずつにし、色などの印は入れず、終わりの空行を落とす）。
- AI に渡す読み取り（`terminals.ts` の `agentTerminals`。コアの `TerminalControl`。`index.ts` が `startCore({ terminals })` で渡す）: 動いているシェルのタブの一覧（画面が `terminal.open` の `meta`（`@shared/ipc` の `TerminalTabMeta`。プロジェクトとタブの名前）でつなぐたびに知らせたもの・始めたフォルダ・コマンド）と、`TerminalOutput.tail` の最後の行。読むだけで、書く・止めるは渡さない。

## 眠らせない（app/keepAwake.ts）

- 本体（コアが動くこのプロセス）を眠らせないのは、作業中のチャットがある間と、スマホ連携がオン（設定の `remote_enabled`）で電源につないでいる間（`keepAwakeRules.ts` の `keepAwakeReason`。2026-11-14 に決めた。スマホから新しい指示を送るには、待っている間も本体が起きている必要があるため。バッテリーのときは、作業中でなければ眠ってよい）。`powerSaveBlocker` の `prevent-app-suspension`（画面は消えてよく、本体だけ起こしておく。`pmset -g assertions` に `NoIdleSleepAssertion` が出る）。
- 作業中の数とスマホ連携のオン・オフはコアの `Core.awakeNeeds`、電源は `powerMonitor`（`isOnBatteryPower`・`on-ac` / `on-battery`）から読み、Bus の `chat`・`settings` と電源の知らせのたびに付け外しする（`index.ts` がコアを起動したあと `startKeepAwake`）。変わったら起動の記録に「眠らせない: working / mobile / なし」を残す。
- MacBook のふたを閉じたときの眠り（外部ディスプレイと電源をつないでいるときを除く）は、これでは防げない。

## 通知（notifications/）

- Mac の通知はメインプロセスの `Notification` で出す（画面の通知は、画面を読み込み直す・終えると通知センターから消え、届かなかった理由も分からないため）。チャットの完了・失敗・回答待ち・CI の失敗は、出すか（だれも見ていないか・設定）と文をコアが決め（`src/core/CLAUDE.md` の「通知」）、`startCore({ notify })` に渡した `notifyFromCore` が出す。押したときの処理を付けておくため、新しいものから 50 件の参照を持つ。Kickoff を終えても通知センターに残る（終わり方は「終了」）。
- 通知の ID にチャット（`kickoff-chat:`）か CI の実行（`kickoff-ci:`。CI の失敗の知らせ）を埋め込み（`notificationIds.ts` の `notificationIdOf` / `chatOfNotificationId` / `ciOfNotificationId`。毎回変える）、起動したら `Notification.getHistory()` で通知センターに残っているものにも押したときの処理を付け直す。押したら Kickoff を前に出し、`notifications.onOpenChat` で画面にそのチャットを、`notifications.onOpenCi` で CI のタブのその実行を開かせる。
- 画面からは `notifications.notify`（設定の「テスト通知を送る」。結果は `{ ok }` か `{ ok: false, error }`）・`notifications.openSettings`（Mac の「システム設定 → 通知」）・`notifications.setBadge`（Dock のアイコンの赤い数字。`app.setBadgeCount`。0 で消える。数えるのは画面）。

## 性能の記録（diagnostics/）

- 重いときに再起動せず、その場で取る（ヘルプのメニュー・設定の「診断」→ `diagnostics.start`）。`diagnostics.ts` の `startDiagnostics` が自分の画面に `webContents.debugger` をつなぎ、10 秒（`DIAGNOSTICS_SECONDS`）の CPU プロファイル・画面の要素の数・メモリ（GC のあと・外れたままのノードの目安）・1 秒あたりの処理の時間・操作の遅れと長いフレーム（画面で評価する式とまとめる純粋関数は `rendererTiming.ts`）と、メインプロセスの分（`mainProcess.ts` の `startMainRecording`: CPU プロファイル・イベントループの遅れ・コアが画面へ送った知らせの数と量・SSE の数・DB の様子（`Core.databaseStats()`。メインは SQL を流さない））・プロセスごとの CPU とメモリを集める。デバッグ用のポートは開かない。
- 保存先はログの場所（`app/logs.ts` の `logsDir()`）の `diagnostics/<日時>/` で、`summary.json`・`profile.cpuprofile`（画面）・`main.cpuprofile`（どちらも Chrome の開発者ツールで開ける）。データの保存先（Application Support）はエージェントから読めない（`chat/guard/selfProtection.ts`）ので、場所を貼っても読めるようログの場所に置く。以前の保存先の記録は、起動のときに `moveLegacyDiagnostics` で移す。
- 様子は `diagnostics.onState` で画面に知らせる（記録の間も操作を続けられるよう、ダイアログにしない）。保存先と最近の記録は `diagnostics.folders`、Finder で開くのは `diagnostics.openRoot`（メニューの「保存先を開く」と共通）。集計は `profileSummary.ts` / `rendererTiming.ts` でテストする。

## 起動の記録

- `app/startupLog.ts`: `~/Library/Logs/<アプリ名>/startup.log` に、起動の各段階（whenReady・ログインシェルの PATH・コア・認証の Cookie）と、メインのウィンドウの画面の読み込み（読み込みの各段階・失敗・画面のプロセスの異常終了・応答なし・preload のエラー・画面の console.error・10 秒たっても終わらない）・子プロセスの異常終了を書く。512KB を超えたら 1 世代だけ残す。`npm run install-app` で入れ替えた直後の初回だけ画面が出ないことがあり、macOS の記録では画面の中で何が起きたか分からなかったため。エージェントも読める場所に置く。

## 製品版の画面の配信

- 製品版の画面はコア（`core/http/server.ts`）が配る。画面のファイルは `Cache-Control: no-cache` で返す（serveStatic は Last-Modified だけを付けるので、そのままだと Chromium が経験則でキャッシュを新しいとみなし、アプリを入れ替えたあとの起動で古い index.html・JS を問い合わせずに使い、新しいコアとかみ合わずに画面が真っ暗になった）。SPA の index.html を返すのは拡張子のないパスだけで、ない JS・CSS は 404。
- `npm run install-app` は製品版を終了させ、Helper の終わりも待ってから、画面の HTTP キャッシュ（保存先の `Cache`。チャット・localStorage は別）を消して入れ替える。
