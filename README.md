# Kickoff

個人のアプリ開発を、AI エージェントと一緒に **要件定義 → 実装 → テスト → デプロイ** まで進めるための Mac デスクトップアプリ（自分専用）。

- 要件: [docs/requirements.md](docs/requirements.md)
- 実装計画: [docs/plan.md](docs/plan.md)

## 前提

- macOS（Apple Silicon）、Node.js 22.13 以上
- Claude Code にログイン済み（Kickoff は Agent SDK に同梱された Claude Code を使い、そのログインで動く。API キーは不要）
- GitHub CLI にログイン済み（`brew install gh && gh auth login`）

## 開発

```sh
npm install
npm run dev        # Electron アプリを開発モードで起動
npm test           # コアの単体テスト
npm run typecheck  # 型チェック
npm run daemon     # Electron なしでコア（API サーバー）だけを起動
npm run dist       # .app / .dmg を作成
npm run icon       # build/icon.svg・icon-dev.svg からアプリのアイコン（本番・開発版の .png / .icns）を作り直す
```

インストールしたアプリ（本番）と開発（`npm run dev` / `npm run daemon`）は、名前・保存先・ポートを分けてあり、同時に動かせる（`src/core/appEnv.ts`）。

| | 本番（`/Applications/Kickoff.app`） | 開発 |
|---|---|---|
| 名前（Dock・メニューバー） | Kickoff | Kickoff Dev（アイコンに DEV の帯） |
| データ | `~/Library/Application Support/Kickoff/` | `~/Library/Application Support/Kickoff Dev/` |
| ポート | 4317 | 4318 |

開発のデータは、初めて起動したときに本番のデータから一度だけ写す（`src/core/devData.ts`）。そのあとは別々のデータになる。本番のデータで試し直したいときは、開発アプリを止めて `Kickoff Dev` のフォルダを消してから起動する。

`npm install` のあと（postinstall）に、開発用の Electron.app の名前とアイコンを「Kickoff Dev」に書き換える（`scripts/dev-app-identity.mjs`。Dock やメニューバーに「Electron」と出ないように）。アイコンを作り直したら `node scripts/dev-app-identity.mjs` で当て直し、開発アプリを起動し直す。

## 構成

| ディレクトリ | 役割 |
|---|---|
| `src/core` | Electron に依存しない中核（HTTP API・SQLite・エージェント実行）。デスクトップ画面・スマホ・将来のネイティブアプリが同じ API を使う |
| `src/main` | Electron のメインプロセス（コアの起動、ウィンドウ、ネイティブダイアログ） |
| `src/preload` | 画面に公開する最小限のネイティブ機能 |
| `src/renderer` | 画面（React） |
| `build` | アプリのアイコン（元の絵は本番 `icon.svg`・開発版 `icon-dev.svg`） |
| `scripts` | アイコンの作成・開発用の Electron.app の書き換え |

| 環境変数 | 説明 |
|---|---|
| `KICKOFF_PORT` | API サーバーのポート（既定は本番 4317・開発 4318） |
| `KICKOFF_DATA_DIR` | `npm run daemon` のデータ保存先（既定は開発の `Kickoff Dev`） |
| `KICKOFF_ALLOW_API_KEY` | `1` のときだけ `ANTHROPIC_API_KEY` をエージェントに渡す（既定はプランのログインを使用） |
