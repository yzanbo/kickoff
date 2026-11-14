# Kickoff のスマホのアプリ（Android）

Android から、Tailscale 経由で Mac の Kickoff のチャットを使うアプリです。APK を GitHub Releases に置いて配ります（審査・費用なし）。

## 使う人

1. Mac とスマホに Tailscale を入れ、同じアカウントでログインします。
2. Mac の Kickoff の設定の「スマホ連携」で「スマホからつなぐ」をオンにし、「家の外からつなぐ（Tailscale Serve）」の手順で Serve を始め、出た URL を「つなぐ先の URL」に入れます。
3. GitHub Releases の APK をスマホに入れ（提供元不明のアプリの許可が要ります）、「本体をつなぐ」で Mac の画面の QR を読みます。
4. Mac の画面で「つなぐ」（家族・共用の端末なら「見るだけでつなぐ」）を押します。

## 配る人（APK を作る人）が最初に 1 回だけすること

次の 3 つは、あとで変えられません。最初に決めて保管します。

| もの | 決めたもの | なくす・変えると |
|---|---|---|
| Android のパッケージ名 | `app.ade.kickoff`（`app.config.ts`） | 別のアプリ扱いになり、入れ直しになる |
| Expo のプロジェクト | 配る人の Expo のアカウントの `kickoff` | 端末のプッシュ用 ID が使えなくなる |
| APK の署名の鍵 | Expo が作って預かる。控えを Bitwarden に置く | 上書きの更新ができなくなる（Google Play へ移すときも要る） |

1. Expo のアカウント（無料）を作り、このフォルダで `npx eas-cli@latest login`、続けて `npx eas-cli@latest init` でプロジェクトを作ります。出た ID を、ビルドのときの環境変数 `EXPO_PROJECT_ID`（とアカウント名 `EXPO_OWNER`）に入れます（`app.config.ts` が読みます。リポジトリには書きません）。
2. Firebase のプロジェクトを作り、Android のアプリ（パッケージ名 `app.ade.kickoff`）を足して `google-services.json` をこのフォルダに置きます（リポジトリには入れません。`.gitignore` 済み）。
3. Firebase の「プロジェクトの設定 → サービス アカウント → 新しい秘密鍵を生成」の JSON を、`npx eas-cli@latest credentials -p android` の「Google Service Account → FCM V1」で Expo に上げます（JSON は秘密です。上げたら手元から消すか、Bitwarden に置きます）。本体（Mac の Kickoff）は何も持ちません。
4. `EXPO_PROJECT_ID=… EXPO_OWNER=… npx eas-cli@latest build -p android --profile release` で APK を作ります（初回は「Generate new keystore」を選びます）。
5. 署名の鍵の控え: `npx eas-cli@latest credentials -p android` →「credentials.json: Upload/Download」→「Download credentials from EAS to credentials.json」で、鍵（.jks）と `credentials.json`（パスワード）が手元に来ます。両方を Bitwarden に添付して置き、手元からは消します（リポジトリには入れません）。
6. できた APK を GitHub Releases に置きます。

## 開発

- `npm install`（xterm の素材も作ります）→ `npm run typecheck`。
- 実機で確かめるときは APK を作って入れます（Expo Go ではプッシュが使えません）。本体は開発版を別のポートで出します: `tailscale serve --bg --https=8443 http://127.0.0.1:4318`（製品版の 4317 は使いません）。
- 書き方の決まりは `CLAUDE.md`。
