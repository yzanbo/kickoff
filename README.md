# Kickoff

> [!WARNING]
> β 版です（0.1.0-beta）。macOS（Apple Silicon）でしか確かめていません。
> 機能・画面・保存の形は予告なく変わり、版によってはそれまでのデータを引き継がないことがあります。

アプリ開発を、AI エージェントとのチャットで進めるための Mac デスクトップアプリ。プロジェクトごとに、作業場所（git のワークツリー）・グループ・状態でチャットを並べ、並行して進める。

- 機能の一覧（受け入れの一覧と前提）: [docs/features.md](docs/features.md)
- 設計（構成・機能の一覧と向き・語彙）: [docs/architecture.md](docs/architecture.md)
- 書き方の決まり: `CLAUDE.md`（ルートと各フォルダ）

## 入れ方

1. [GitHub の Releases](https://github.com/nexy-apps/kickoff/releases) から `Kickoff-<版>-arm64.dmg` をダウンロードし、Kickoff を「アプリケーション」へ入れる。本物はここからだけ配っている（ほかの場所の Kickoff は入れない）。
2. 初めて開くときは止められるので、システム設定の「プライバシーとセキュリティ」で［このまま開く］を押す（Apple の公証をしていないため。2 回目からと、アプリの中の更新では出ない）。
3. 新しい版が出ると、左下の ⚙ に印が付く。⚙ を押して設定の上の帯の［更新して開き直す］を選ぶ（作業中のチャットがあれば、終わってから開き直す）。

## 使い方

![全プロジェクトのボード。チャットが状態（下書き・作業中・回答待ち・未読・既読）の列に並ぶ](docs/images/board.png)

1. **プロジェクトを作る**: サイドバーの「＋」から、新しいフォルダを作る（`git init` まで）か、既存のフォルダを取り込む。
2. **チャットで頼む**: 「新しいチャット」（⌘N）に指示を書いて送る。入力欄の下で、AI・モデル・考える深さ・権限モード（毎回確認・編集は自動で承認・Auto mode・計画）を選ぶ。作業ごとにワークツリー（ブランチ）を分ければ、複数のチャットを並行して進められる。
3. **自分の番を拾う**: チャットは状態ごとに並ぶ。「全プロジェクト」のボードや、サイドバーの「要対応」（回答待ち・エラー・未読）で、返事が要るものだけを順に開く。チャットはグループでまとめられる。
4. **答える・足す**: AI の承認依頼・質問には、チャットの中で答える（下の画面は、計画の承認待ち）。作業中でも、入力欄の「いま」で止めずに伝えるか、「あとで」で送信待ちに積める。

![チャットの画面。計画モードの AI が出した計画に「許可」か「拒否」で答える](docs/images/chat.png)

5. **確かめて出す**: 「変更」タブで差分を見てコミット・プッシュし、ワークツリーの帯から GitHub に PR を作る（マージは GitHub か GitHub タブで）。ターミナル・ブラウザ・ノート・DB クライアントもアプリの中で開ける。外出中は、スマホから承認・回答・次の指示ができる（同じ Wi-Fi か Tailscale。QR でペアリング）。

## 前提

- macOS（Apple Silicon）、Node.js 22.13 以上
- Claude Code にログイン済み（Kickoff は Agent SDK に同梱された Claude Code を使い、そのログインで動く。API キーは要らない）。ほかの AI（Codex・GitHub Copilot・Cursor・Gemini）は、それぞれのログインか API キーで選べる
- GitHub CLI にログイン済み（`brew install gh && gh auth login`）。開発するアプリのリポジトリは GitHub に自分で作り、remote（origin）を設定しておく（Kickoff はリポジトリを作らない）

## 開発

```sh
npm install
npm run dev                    # 開発版（Kickoff Dev）を起動
npm run dev:cdp                # 同じく、CDP のポート 9333 を開いて起動
npm run fixture:seed           # 決まったデータを /private/tmp/kickoff-fixture に作る（scripts/devtools/fixture.mjs）
npm run dev:fixture            # そのデータで開発版を起動（コア 4319・CDP 9335）
npm run typecheck              # 型（使っていない import・変数も見る）
npm run test:changed           # 変えたファイルに関係するテストだけ（作業中）
npm test                       # 全体（Vitest。ファイルの順番を毎回入れ替える）
npm run test:isolated          # 全体を、ファイルごとに新しいプロセスで
npm run test:db                # DB のドライバを Docker の本物の DB で確かめる
npm run knip                   # 使っていない export・ファイル・依存
npm run build                  # ビルド（out/）
npm run mobile:typecheck       # スマホのアプリ（mobile/）の型
npm run daemon                 # Electron なしでコアだけを起動（データは KICKOFF_DATA_DIR）
npm run dist                   # 印鑑なしで .app・dmg・zip を作る
npm run install-app            # 手元ビルドで製品版を入れ替える（下の「製品版を作る」）
npm run icon                   # build/icon*.svg からアイコンを作り直す
node scripts/ui-snapshot.mjs take <名前>   # 画面の DOM とスタイルを記録（diff で比べる）
```

コミットと push のたびに git のフック（`.githooks/`。`npm install` が設定する）が確かめを流し、落ちたら止める。コミット時は文書の検査と、コードを含めば構造の検査・型・knip・テストの書き方の見張り・関係するテスト。push 時は文書と構造の検査・`npm test`・ビルド。コミットしない変更が混ざっていると止まる。

インストールしたアプリ（製品版）と開発版は、名前・保存先・ポートを分けてあり、同時に動かせる（`src/foundation/core/system/appEnv.ts`）。開発版のデータは、初めて起動したときに製品版のデータから一度だけ写す。

| | 製品版（`/Applications/Kickoff.app`） | 開発版 |
|---|---|---|
| 名前（Dock・メニューバー） | Kickoff | Kickoff Dev（アイコンに DEV の帯） |
| データ | `~/Library/Application Support/Kickoff/` | `~/Library/Application Support/Kickoff Dev/` |
| ポート | 4317 | 4318 |
| アプリ ID | `app.nexy.Kickoff` | `app.nexy.Kickoff.dev` |

製品版は金庫の印鑑で署名するので、入れ替えても許可は残る。開発版は仮の署名で、Electron.app が置き直されたら許可を消して聞き直す（`scripts/mac-privacy.mjs`）。

### 製品版を作る（作る人向け。macOS のターミナルで流す）

- `npm run install-app`: 手元ビルドを金庫の印鑑で作って製品版を入れ替える（製品版を終了してから金庫のパスワードを聞く）。
- `ADHOC=1 npm run install-app`: 金庫のない Mac（clone した人）が、印鑑なしで製品版を作る。入れ替えるたびに許可を聞き直し、新しい版の知らせは出ない。
- `npm run publish`: 配る（`release-notes/<版>.md` が要る。dmg と zip を Releases へ、版の一覧を Pages へ置く）。
- データを引き継がない版へ上げるときは、先に保存先の `Kickoff` を `Kickoff.old` に退避する（知らない版の DB は開かない）。

`.claude/settings.json` の SessionStart フックは、同梱の Claude Code の新しい版を知らせる（`scripts/check-agent-updates.mjs`）。

| 環境変数 | 説明 |
|---|---|
| `KICKOFF_PORT` | コアのポート（既定は製品版 4317・開発版 4318） |
| `KICKOFF_DATA_DIR` | `npm run daemon` のデータの置き場所（既定は開発版の `Kickoff Dev`） |
| `KICKOFF_HOST` | `npm run daemon` の待ち受けの住所 |
| `KICKOFF_REMOTE_DEBUG` | 開発版で CDP を開くポート |
| `KICKOFF_USER_DATA_DIR` | 開発版の保存先を変える（製品版では見ない） |
| `KICKOFF_ALLOW_API_KEY` | `1` のときだけ `ANTHROPIC_API_KEY` を Claude Code に渡す（既定はログインを使う） |
| `KICKOFF_EXPERIMENTAL_PROVIDERS` | 本物で確かめる前の AI を使う（`,` 区切りの ID。開発のとき） |
| `KICKOFF_RUN_TRACE` | `1` のとき、チャットの実行の出来事と命令をログに書く |

## 構成

| ディレクトリ | 役割 |
|---|---|
| `src/shared` | 純粋な型と関数（Node・DOM・Electron・React に依らない）。コア・画面・メイン・preload・スマホが読む |
| `src/foundation` | 機能の言葉を持たない土台（コア `core/`・画面 `ui/`・メインと preload `desktop/`） |
| `src/features` | 機能ごとのフォルダ（中は `core/`・`ui/`・`desktop/`・`worker/` と `CLAUDE.md`） |
| `src/app` | 組み立て（コア・メイン・画面の入口）。ここだけが全部の機能を知る |
| `mobile` | スマホのアプリ（Android・Expo。別の npm のまとまり） |
| `native`・`build`・`scripts` | 音声認識の補助コマンド（Swift。`swiftc` がなければ作らずにビルドを続ける）・アイコン・道具 |

詳しくは [docs/architecture.md](docs/architecture.md)。

## ライセンス

[PolyForm Noncommercial License 1.0.0](LICENSE)。オープンソースのライセンスではありません。

- 非商用の目的なら、使う・直す・配ることができます（個人の学習・研究・実験・趣味、慈善団体・教育機関・公的な研究機関・行政機関での利用など）。配るときは、ライセンスの条文（または URL）と `LICENSE` の先頭の `Required Notice:` の行を一緒に渡してください。
- 商用の目的には使えません。改変したものを含めて売ること、有料のサービスにすること、会社の業務で使うことなどが当たります。商用で使いたいときは、作者に相談してください。
