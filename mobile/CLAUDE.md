# スマホのアプリ（mobile/。Android）

Android から Tailscale 経由で本体（Mac の Kickoff）のチャットを使うアプリ。Expo（React Native）・TypeScript で、本体と同じ `@shared`（`../src/shared`）を使う。配り方は `README.md`。

## 置き場所と依存
<!-- 行き先: mobile/（そのまま） -->
- 別の npm のまとまり（`package.json`・`node_modules` も別。本体と React の版・依存が違うので混ぜない）。本体からは import しない。
- `@shared/*` は `tsconfig.json` の `paths` と `metro.config.js` の `watchFolders`。本体のコードは `@shared` のほかを読まない。
- Expo は版ごとに API が変わる。書く前に `package.json` の版の文書と `https://docs.expo.dev/llms.txt` を読む。部品は `npx expo install`。
- 画面は Expo Router（`src/app/` の 1 ファイル = 1 画面）。画面でないものは `src/app/` の外に置く。

## 中身
<!-- 行き先: mobile/（そのまま） -->
- `src/lib/`: 純粋な関数（本体の `npm test` が流す。API `client.ts`・SSE `sse.ts`・つながり `connection.ts`・版 `version.ts`）。
- `src/state/`: 本体ごとのつながり・本体の一覧（SecureStore）・プッシュ。`src/chat/`: 会話の部品。色は `src/ui/colors.ts`。
- パソコンと同じ決まりは `@shared` の関数を使い、写さない（書いている途中の返答・作業場所の区切り・数式・図）。
- 見るだけの端末は、送る・答える・作る操作を出さない（本体も断る）。本体は本体の ID で分ける。

## 決めたこと
<!-- 行き先: docs/architecture.md（「決めたこと」） -->
- パッケージ名 `app.ade.kickoff` を変えない（別のアプリになる）。`EXPO_PROJECT_ID` を変えると端末のプッシュ用 ID が使えない。
- プロジェクトの ID と `google-services.json` は EAS の環境変数に置く。署名の鍵はリポジトリに入れない。
- ファイル・Git の変更はスマホに開かない。

## 確かめ方
<!-- 行き先: mobile/（そのまま） -->
- 型は本体の `npm run mobile:typecheck`、テストは本体の `npm test`。束ねるのは `npx expo export --platform android`、設定は `npx expo-doctor`。
- 実機は APK で（Expo Go ではプッシュが使えない）。本体は開発版を Tailscale Serve の別のポートで出す（`tailscale serve --bg --https=8443 http://127.0.0.1:4318`。製品版の 4317 は使わない）。
