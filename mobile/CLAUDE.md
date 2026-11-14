# スマホのアプリ（mobile/。Android）

Android から、Tailscale 経由で本体（Mac の Kickoff）のチャットを使うアプリ（スマホ連携の作る順の「2」。メモの「スマホ連携 サーバー構成の比較と案（図）」の 3・13・15〜18 節）。Expo（React Native）・TypeScript で、本体と同じ `@shared`（`../src/shared`）の型と純粋な関数を使う。配り方は APK を GitHub Releases に置く（手順は `README.md`）。

## 置き場所と依存

- リポジトリの中の別の npm のまとまり（`package.json`・`node_modules` も別。2026-11-14 に利用者と決めた。本体と React の版・依存が違うので混ぜない。あとで workspaces に分け直すときは、このフォルダを動かすだけ）。本体からは import しない（本体の `src/` はアプリを知らない）。
- `@shared/*` は `tsconfig.json` の `paths`（Expo の Metro が読む）と、`metro.config.js` の `watchFolders`（書き換えをすぐ映す）。`@shared` は Node・DOM・Electron・React に依らないので、そのまま読める。
- Expo は版ごとに API が変わる。書く前に、`package.json` の `expo` の版の文書（`https://docs.expo.dev/versions/v<版>.0.0/`）と `https://docs.expo.dev/llms.txt` を読み、覚えている書き方で書かない。部品は `npx expo install <名前>` で入れる（SDK に合う版を選ぶ）。
- 画面は Expo Router（`src/app/` の 1 ファイル = 1 画面。`_layout.tsx` が枠）。画面でないもの（状態・部品・純粋な関数）は `src/app/` の外に置く。

## 中身

- `src/lib/`（純粋な関数。テストは同じフォルダの `*.test.ts` で、本体の `npm test` が流す）: SSE の読み方 `sse.ts`（EventSource がないので fetch のストリームを読む）・本体への API `client.ts`（`HostClient`。端末のトークンを `Authorization: Bearer`、API の版を `x-kickoff-api` で送る。断られたら `ApiError`（状態と本体の印 `code`））・ペアリング `pairing.ts`（QR の `<つなぐ先>/pair?code=…&host=…` を読む・番号で頼む・答えを聞く。つなぐ先は https だけ）・版の互換 `version.ts`（`APP_API_VERSION` / `MIN_HOST_API_VERSION`。合わなければ「アプリを更新してください」「Mac の Kickoff を更新してください」）・本体の一覧 `hosts.ts`（`HostRegistry`。本体の ID ごと。トークンは別のキー）・本体の一覧の様子 `hostState.ts`・チャットの行 `timeline.ts`（メインエージェントの発言・ツールの 1 行・終わり。サブエージェントの中身は出さない。数式を含む返答には `math` の印、AI が描いた図（`show_visual`）は描いた位置にいちばん新しい中身（`@shared/chat/aiVisual` の `collectVisuals`）、描き直しの位置は 1 行のお知らせ）・数式と図を描く WebView のページ `richPages.ts`（数式は `@shared/markdown/mathGuard` の `mathRanges` の場所だけを KaTeX で・Mermaid の図・SVG / HTML の図はパソコンと同じ `visualDocument` に CSP とスマホの配色 `MOBILE_VISUAL_THEME`。KaTeX と Mermaid は APK を大きくしないよう cdn.jsdelivr.net から読み、どのページも図の枠と同じ CSP）・通知の行き先 `notice.ts`。
- 色は `src/ui/colors.ts`（react-native に依らない。純粋な関数の図のページでも使う。`ui/theme.ts` がそのまま出す）。
- `src/lib/connection.ts`: つながりの様子 `SessionState` と決め方（hello で版が合わない・版を知らせない古い本体 → 更新の案内、本体の ID がつないだときと違う → `other_host`、401 → 取り消された、403 `mobile_off`、426 → アプリが古い。話が通じない・取り消された・別の本体ならつなぎ直さない `isFinal`）。
- `src/state/`: 本体ごとのつながり `hostSession.ts`（SSE。最初の hello で版と本体の ID を確かめる。切れたら 1 秒から 30 秒まで間を空けてつなぎ直す。アプリを裏に回したら止め、表に戻ったらつなぐ。つながるたびに画面が `?after=` で抜けた分を取る）・本体の一覧とつながり `hosts.tsx`（`HostsProvider`。保管庫は SecureStore = Android の Keystore）・本体の一覧の様子 `useHostState.ts`（この端末のできること = 見るだけかも）・プッシュ `push.ts`（チャンネル `chats` を先に作り、Expo のプッシュ用 ID を取る。通知の data の本体の ID とチャットの ID で開く。外した本体の通知なら本体の一覧へ）。宛先は本体につながるたびに知らせ直し（`_layout.tsx` の `PushRegistrar`。オフラインで知らせられなかったときも次につながれば戻る）、本体を外すときは先に宛先を消してもらう。
- 画面（`src/app/`）: 本体の一覧 `index.tsx`（長押しで外す）・本体をつなぐ `pair.tsx`（QR を読む・URL と番号を打つ → Mac の画面で「つなぐ」を待つ）・チャット一覧 `[host]/index.tsx`（プロジェクトごと）・チャット `[host]/chat/[id].tsx`（会話（数式を含む返答と AI が描いた図は、高さを中身に合わせた WebView `src/chat/RichView.tsx` の `MathText` / `VisualView` で描く。中のリンクは中で開かず外のブラウザへ。図の中のボタンを押したとき（`sendPrompt`）は、作業中なら伝える・そうでなければ送る。見るだけの端末では送らない）・回答待ちのカード `src/chat/ApprovalCard.tsx`（承認・質問。質問の回答の鍵は質問の文）・送信待ち・入力欄 `src/chat/Composer.tsx`（作業中は「伝える」「送信待ちへ」「止める」）。見ている間は本体に「見ている」を知らせる = そのチャットの通知は来ない）・新しいチャット `[host]/new.tsx`・ターミナル `[host]/terminals.tsx` と `[host]/terminal/[key].tsx`（本体のシェルに WebSocket でつなぎ、WebView の中の xterm.js に描く。xterm.js は `scripts/xterm-assets.mjs` が `npm install` のあとに文字列の TS にする。下の帯に Esc・Tab・Ctrl+C・矢印）。
- 見るだけの端末（本体の設定で選ぶ）は、入力欄・回答・新しいチャット・新しいシェルを出さず、そう書く（本体も断る）。
- 複数の本体を本体の ID で分ける（手元に持つものも本体ごと）。

## 決めたこと（2026-11-14 に利用者と決めた）

- パッケージ名は `app.ade.kickoff`（変えると別のアプリ扱い）。Expo のプロジェクトは配る人のもの（`EXPO_PROJECT_ID`。変えると端末のプッシュ用 ID が使えなくなる）。プロジェクトの ID と Firebase の `google-services.json`（`GOOGLE_SERVICES_JSON`）は EAS の環境変数に置く（EAS Build は Git で管理しているものしか上げない。`app.config.ts` が環境変数を読み、手元ではこのフォルダの `google-services.json` も読む）。APK は EAS Build で作り、署名の鍵は Expo が預かり、控えを Bitwarden に置く（リポジトリには入れない）。
- ファイル・Git の変更はスマホに開かない。ターミナルは打てる形で開く。
- 通知を詳しくする（暗号化して載せる）のは、あとで足す。

## 確かめ方

- 型は `npm run typecheck`（このフォルダで。xterm の素材も作る）、純粋な関数のテストは本体の `npm test`、束ねられるかは `npx expo export --platform android --output-dir /tmp/kickoff-mobile-export`、設定の診断は `npx expo-doctor`。本体の `npm run mobile:typecheck` でも流せる。
- 実機での確かめは APK を入れて（Expo Go ではプッシュが使えない）、本体は開発版を Tailscale Serve の別のポートで出す（`tailscale serve --bg --https=8443 http://127.0.0.1:4318`。製品版の 4317 は使わない）。
