# Kickoff の設計

構成・層・機能の一覧と向き・共通の仕組み・語彙・決めたことを書く。書き方の決まりはルートの `CLAUDE.md`、機能ごとの地図と決まりは各フォルダの `CLAUDE.md`、受け入れの一覧は `docs/features.md`、コマンドは `README.md`。スキーマは `src/app/core/migrations.ts` が並べる各機能の `core/schema.ts`。

## 0. この文書の役目

- どの機能がどこにあり、どの向きに読んでよいかの地図。形の細部はコードの JSDoc とテストの名前に任せる。
- 語彙は画面の言葉とコードの名前の対応。表のコードの名前は `scripts/check-docs.mjs` がコードに実在するかを確かめ、機能の表の並びは `scripts/structure.config.mjs` の `FEATURES` と同じかを確かめる。

## 1. 構成

```
src/
  shared/                 純粋（Node・DOM・React・Electron・npm のパッケージに依らない）。コア・画面・メイン・preload・スマホが読む
    foundation/           機能に依らない純粋な土台（errors・path・text・time・contract/・ipc/・api/・markdown/・testing/ …）
    <機能>/               その機能の取り決め（contract.ts・events.ts・settings.ts・tools.ts・types.ts）と、両側で同じに使う決まり
  foundation/             土台（機能の言葉を持たない）
    core/                 コアの土台（Kernel・CoreFeature・db/・http/・bus・clock・system/・platform/・workplace/・files/・watch/・aiTools/・settings/・host/・testing/）
    ui/                   画面の土台（store/・query/・storage/・api/・navigation/・points・kit/・hooks/・lib/・workplace/・document/・external/・commands/・shell/・theme/・styles/）
    desktop/              メインプロセスの土台（parts・app/・ipc/・platform/・notifications/・terminal/・diagnostics/）と preload/
  features/<機能>/        機能（下の 3 章の 40 個）
    core/                 コアの部分（index.ts が createX を出す・schema.ts・routes・tools.ts・db/・testing.ts）
    ui/                   画面の部分（index.ts・contributes.ts・storage.ts・api・部品と隣の CSS・testing.ts）
    desktop/              メインの部分（browser と diagnostics だけ）
    worker/               別プロセスの入口（database だけ）
    CLAUDE.md             地図・決まり・落とし穴（4KB まで）
  app/                    組み立て（ここだけが全部の機能を知る。並べるだけで仕組みは書かない）
    shared/               純粋な束ね（contracts.ts・settings.ts・ipc.ts・aiToolViews.ts）
    core/                 startCore.ts・assemble.ts（機能の組み立て）・migrations.ts・daemon.ts・hostMain.ts・net/（網のテスト）・scenarios/・testing/
    desktop/              index.ts（メインの起動の順）・preload.ts
    renderer/             index.html・main.tsx・App.tsx・PopoutApp.tsx・registry.ts（拡張点への登録の表）・storage.ts・styles/index.css・shell/
mobile/                   スマホのアプリ（Android・Expo。別の npm のまとまり。読むのは src/shared と src/app/shared）
scripts/  docs/           道具と文書
```

- 1 つの機能は `src/shared/<機能>/`（純粋な取り決め）と `src/features/<機能>/`（コア・画面・説明）の 2 か所で完結する。純粋な部分を別の木にするのは、スマホと preload が読む範囲をフォルダ 1 つで守るため。
- 別名は 2 つ: `@shared/*` → `src/shared/*`、`@/*` → `src/*`。中間の層（`src/features/`・`src/foundation/`・`src/shared/`）と `src/app` には `CLAUDE.md` を置かない（祖先の `CLAUDE.md` は毎回読み込まれる）。

## 2. 層と import

| 読む側 | 読んでよい先 |
|---|---|
| `shared/foundation` | `shared/foundation` だけ |
| `shared/<機能>` | `shared/foundation`・`shared/<自分と下の機能>` |
| `foundation/core`・`foundation/ui` | `shared/foundation`・自分の土台 |
| `foundation/desktop` | `shared/foundation`・`foundation/core`（RPC・OS の口・保存先）・`foundation/desktop` |
| `features/<機能>/core` | `shared`（自分と下の機能）・`foundation/core`・下の機能の `core/index.ts` |
| `features/<機能>/ui` | `shared`（自分と下の機能）・`foundation/ui`・下の機能の `ui/index.ts` |
| `features/<機能>/desktop` | `shared`・`foundation/core`・`foundation/desktop`・自分の `core`（型だけ） |
| `features/<機能>/worker` | `shared`・自分の `worker` |
| `app/*` | そのプロセスの全部 |
| `mobile` | `shared`・`app/shared` |

- コアと画面は互いに読まない。土台は機能を、機能は `app` を読まない。機能のテストが `src/app/core/testing` を読むのはテストだけの例外。
- 下が上の力を要るときは、下が口（画面は拡張点、コアは `api` の登録の口、土台は `Kernel.workplace` などの登録先）を宣言し、上が登録して `app` が渡す。import したときの副作用で登録しない。
- ほかの機能を読むのは入口（`core/index.ts`・`ui/index.ts`。テストは `core/testing.ts`・`ui/testing.ts` も）だけ。`shared/<機能>` は取り決めの層なので直に読んでよい。
- 兄弟のフォルダどうしを循環させない。1 ファイル 300 行まで（テスト 400・型や表の宣言だけ 500）。
- `window.kickoff` は `foundation/ui` と機能の `ui/native.ts` だけ。`contributes.ts` を読むのは `src/app/renderer/registry.ts` だけ。外の AI の SDK を読むのは `ai` のその実装の決めたファイルだけ。
- これらは `scripts/check-structure.mjs` がコミット時に確かめる（決まりの表は `scripts/structure.config.mjs`）。

## 3. 機能の一覧と向き

並びは下の層から。上の機能は下の機能の入口を読んでよく、逆は読めない。下の機能が上の力を要るときは、口を宣言して上が登録する。

| # | 機能 | 中身 |
|---|---|---|
| 1 | `settings` | 設定の画面（入れ物。節と項目は各機能が登録）・設定のルート |
| 2 | `panel` | タブの入れ物（欄・ペインの分割・タブの列・種類の登録） |
| 3 | `palette` | 探す窓（⌘K・全文検索。探す対象は各機能が登録） |
| 4 | `trash` | ゴミ箱（一覧・戻す・消す。種類は各機能が登録） |
| 5 | `projects` | プロジェクト（印・並び・新規・編集・プロジェクトの画面とその表・右サイドバー） |
| 6 | `groups` | グループ |
| 7 | `ai` | AI のつなぎ込み（プロバイダー・ログイン・モデルと選択・使用状況・CLI の更新の知らせ） |
| 8 | `chat` | チャットの背骨（型・店・実行の状態機械・出す箱・記録・承認・チャットの AI のツール・開く口・状態の印） |
| 9 | `guard` | 守り（書き込み・見せない DB・自分を守る・砂場） |
| 10 | `attachments` | 添付と「AI に渡す」 |
| 11 | `composer` | 入力欄（文を書く欄の芯・下書きの店・送る口・差し込み口） |
| 12 | `snippets` | 定型文 |
| 13 | `compact` | 圧縮と、圧縮前・圧縮後の指示 |
| 14 | `subagents` | サブエージェント |
| 15 | `childChats` | 子チャット（作る・分岐・親から外す・親へ渡す） |
| 16 | `visuals` | AI が描く図 |
| 17 | `remoteImages` | チャット欄の外の画像とリンク |
| 18 | `providerSwitch` | AI を替えて会話を続ける |
| 19 | `workplaceMove` | チャットの作業場所を変える |
| 20 | `queue` | 送信待ちの画面と、起動したときの再開の確かめ |
| 21 | `userView` | AI が利用者の画面を知る |
| 22 | `notifications` | 通知 |
| 23 | `conversation` | 会話の画面（流れ・発言・ツールの表示・検索・状態の行・動き・承認・巻き戻し） |
| 24 | `chatList` | チャットの並べ方と見せ方（まとめ方・カードと行・その操作・選択・状態ごとの一覧） |
| 25 | `chatPanel` | チャットのパネル（タブのまとまり・新しいチャット・右の欄・連動・別ウィンドウ） |
| 26 | `files` | ファイル（木・開く・保存・検索・置換・リンク） |
| 27 | `git` | Git（状態・変更・コミット・履歴・ブランチ・差分） |
| 28 | `docker` | Docker（compose・サービス・ログ・ポートの取り合い） |
| 29 | `worktrees` | ワークツリー（作る・片付ける・実行環境） |
| 30 | `github` | GitHub と CI（連携先・issue・PR・PR と CI の知らせ） |
| 31 | `notes` | ノート |
| 32 | `database` | DB クライアント（接続・SQL・テーブル・ER 図・DB ワーカー） |
| 33 | `terminal` | ターミナルと下のパネル |
| 34 | `browser` | 埋め込みブラウザと AI のブラウザ操作 |
| 35 | `ports` | ポートを使っているプロセス |
| 36 | `voice` | 音声入力・音声モード・読み上げ |
| 37 | `devices` | スマホ連携（ペアリング・端末・Tailscale・プッシュ） |
| 38 | `diagnostics` | 診断 |
| 39 | `sidebar` | サイドバー |
| 40 | `board` | ボード |

機能ではなく土台に置くもの:

- 作業場所（本体のフォルダかワークツリーか）: git の実行・いちばん深い作業場所・`?worktree=` の解決・作る人の登録（`src/foundation/core/workplace/`）、型・選ぶ部品・色・ワークツリーの一覧の口（`src/foundation/ui/workplace/`）。
- 開く口と移動: ルーター・`open(行き先)`・別ウィンドウ・ウィンドウ間の知らせ（`src/foundation/ui/navigation/`）。外で開く・外部リンク（`src/foundation/ui/external/`）。
- コマンド（⌘K・ショートカット・キーの表示の表。`src/foundation/ui/commands/`）。殻の拡張点（`appHosts`・`footerItems`。`src/foundation/ui/shell/`）。
- フォルダの中のファイルの操作（作る・名前を変える・動かす・ゴミ箱へ。ノート・ファイル・添付が同じ口。`src/foundation/core/files/`）。
- アプリの殻（配置・下の帯・別ウィンドウの入口）は `src/app/renderer/`。

## 4. 共通の仕組み

### 取り決め
- 表を 1 回書き、両側を作る（HTTP・SSE・コアとメインの RPC・IPC・AI のツール・設定）。部品は `@shared/foundation/contract`（`route`・`Contract`・`Same` = 2 つの型が両向きに同じか）。
- HTTP は `src/shared/<機能>/contract.ts` の `"POST /api/snippets"` の形のキーの表。コアは `implement(contract, { キー: { body: zod, handler } })`、画面とスマホは `client(contract)`（呼び手の型 `ApiClient`）。呼び出しは `呼び出し(キー, { params, query, body }, 選択肢)` の 1 つの形。zod は shared に入れない（スマホ・preload・画面の束に入れない）。
- SSE は `src/shared/<機能>/events.ts` が土台の空の `ServerEventMap` に `declare module` で足す。値の表は `src/app/shared/contracts.ts` が並べる。端末に開く口は取り決めの `access`。
- 設定は `src/shared/<機能>/settings.ts` の `setting({ default })`（束ねは `src/app/shared/settings.ts`、PUT の zod は機能の `core/settings.ts`）。

### コアの土台
- `Kernel`: `clock`・`bus`・`db`・`exec`・`platform`・`paths`・`settings`・`secrets`・`log`・`workplace`。
- 機能は `createX(k, deps, env)` で作り、`CoreFeature`（`name`・`api`・`routes`・`pages`・`aiTools`・`start`・`stop`・`stopPhase`）を返す。上の機能は `createX` の中で下の機能の `api` の登録の口を呼ぶ（`chat.api.addTurnContributor`・`trash.api.registerKind`・`guard` の `addRuleSource`）。器（DI コンテナ）は入れない。
- `src/app/core/assemble.ts` が機能を並び順に作る。本物（`startCore`）もテスト（`createTestCore({ features })`）も同じ組み立てを通る。止める順は `src/foundation/core/serve.ts`。
- 失敗は `Invalid` / `NotFound` / `Conflict`（`src/foundation/core/errors.ts`）を投げ、HTTP の土台が状態コードにする。

### DB
- 表は機能の `core/schema.ts`（`table(名前, 列, 選択肢)` で行と型を変換）。版の SQL は各機能の `…_SCHEMA_V1` を `src/app/core/migrations.ts` が並べ、変更は末尾に足す。トランザクションは `tx`。
- 版の印は `PRAGMA application_id`（'KICK'）と `user_version`（300 ＋ 版）。知らない系統・版の DB は開かずに止まる（古い DB を写す・消すコードは持たない）。秘密の値は `secrets` の表（`createSecretStore`）。

### 拡張点（画面）
入れ物が `definePoint<T>(名前)` で口を宣言し、機能が `ui/contributes.ts` で項目を出し、`src/app/renderer/registry.ts` が最初の描画より前に 1 回だけ入れる。重い部品は `lazyPart`。増やすのは、入れ物が 3 つ以上の機能を並べるときだけ。

| 拡張点 | 持ち主 | 登録するもの |
|---|---|---|
| `panelTabs`・`panelSurfaces` | `panel` | タブの種類・欄 |
| `projectViews`・`projectHeaderStats` | `projects` | プロジェクトの画面（真ん中のタブ・右の欄・右サイドバーが同じ表を引く） |
| `commands` | 土台 `commands` | コマンド（⌘K・ショートカット・キーの表示） |
| `paletteSources` | `palette` | ⌘K で探す対象 |
| `settingsSections`・`settingsItems` | `settings` | 設定の節と項目 |
| `footerItems`・`appHosts` | 土台 `shell` | 下の帯の項目・アプリの根に置く物 |
| `composerSlots` | `composer` | 入力欄の上の帯・ピル・道具・メニュー |
| `messageActions`・`toolRowViews` | `conversation` | 発言の操作・ツールの行の中身 |
| `aiToolViews`・`chatFileLinks` | `chat` | Kickoff の AI のツールの表示・ファイルのリンク |
| `chatSideAdds` | `chatPanel` | チャットの右の欄の「＋ ▾」 |
| `handOffTargets` | `attachments` | 「AI に渡す」の渡し先 |
| `openTargets`・`popoutKinds`・`routeLeaveGuards` | 土台 `navigation` | 「開く」の行き先・別ウィンドウの種類・離れる前の確かめ |
| `workplaceDecor`・`worktreeSources`・`workplaceFilesSources` | 土台 `workplace` | 作業場所の飾り・ワークツリーの一覧（worktrees）・ファイルの一覧（files） |
| `trashKinds`・`userViewTabs` | `trash`・`userView` | ゴミ箱の行・タブを AI に説明する文 |
| `filesGit`・`projectGitHubSources`・`worktreePullRequests` | `files`・`git`・`worktrees` | Git の飾り（git）・連携先と PR（github） |

型の表は土台が空の interface を宣言し、機能が `declare module` で足す（`OpenTargetMap`・`PopoutParamsMap`・`WindowMessageMap`・`AppDialogMap`）。メインは機能の `DesktopPart` を `mergeParts` で並べる。

### チャットの実行
- 純粋な `step(state, event, env)`（出来事 → 状態と命令）と、命令を実行する殻 `ChatRunner`。作業中（`isBusy`）は `phase` が `idle` でないことだけ。
- 送信待ちと預かりは出す箱 `Outbox` 1 つ（`chat_outbox` に丸ごと書く）。自動で送らない理由は門（`gates`）で持ち、保存しない。送る口は `message`（`when`）1 本。
- 上の機能は `TurnContributor`（環境変数・フォルダ・システムプロンプトの節・`gate`・`around`・`afterTurn`）を `addTurnContributor` で足す。AI のツールは足さない。
- 「作業中でないと確かめる → 用意 → 確定 → 失敗なら戻す」は `withIdleChat`、作業が終わってから行う予約は `reserveAtTurnEnd`。

### AI のツール
- `defineAiTool({ server, name, description, input（zod）, readOnly, run })` を持ち主の機能の `core/tools.ts` に書き、組 `AiToolGroup` を `CoreFeature.aiTools` で出す。MCP のサーバー（`kickoff_chat` など）は土台の `McpToolHost` が持つ。
- 画面とスマホに要る名前・表示名・記録の 1 行は `src/shared/<機能>/tools.ts` の表（束ねは `src/app/shared/aiToolViews.ts`）。

### 画面の土台
- 店は `createStore`・`createKeyedStore`・`createCell`・`createSignal`・`createRegistry` だけ。1 つの部品だけが読む値は `useQuery`。SSE は `onServerEvent` / `useServerEvent`。
- 保存は機能の `ui/storage.ts` の `defineSettings`（キー `kickoff:<機能>:<名前>`。宣言していないキーは起動で消える）。
- 部品の計算は `*Model.ts` の関数に出してテストする（DOM の道具は入れない）。

### CSS
- 層は `@layer tokens, base, vendor, ui, feature, state;`（`src/app/renderer/styles/index.css`）。機能の CSS は部品の隣で `@layer feature { … }` に包み、部品が import する。
- セレクタの最初のクラスは 1 つの領域の CSS だけが書く（`scripts/check-structure.mjs` が確かめる）。共通の見た目の型は `src/foundation/ui/styles/types/`。

## 5. 語彙

画面の言葉とコードの名前を 1 対 1 にする。チャットの軸（親・子）とエージェントの軸（メイン・サブ）は別なので、画面の言葉で混ぜない。単独の「メイン」は画面に出さない（メインエージェント・メインウィンドウとだけ使う）。動詞は向きで分ける（頭の 3 行）。

| 画面の言葉 | コードの名前 | ひとこと |
|---|---|---|
| 伝える（下へ） | `tell` | 動いている作業に届き、作業を変える |
| 聞く（横へ） | `startChildChat` | だれの作業にも影響しない子チャットで聞く |
| 渡す（上へ） | `handBack`・`handoffRequestPrompt` | 答え・報告を親チャットへ返す |
| チャット | `Chat`・表 `chats`・`chat_id` | 利用者が作る会話 |
| 親 / 子 / 孫チャット | `parent_chat_id`・`childDepthLabel` | 関係で呼ぶ。足す先は名前で出す |
| 家系 | `familyOf` | いちばん上の親から下にぶら下がるチャット |
| 親から外す | `detachChat` | 子チャットを親のないチャットにする |
| 1 回の実行 | `TurnRequest`・`TurnOutcome` | 送ってから終わるまで |
| チャットの記録 | `ChatEvent`・表 `chat_events` | `type` で中身が決まる |
| 作業中の様子 | `ChatLive`・`chat_live` | 保存しない。詳細と SSE が同じ形 |
| 作業の段階 | `WorkPhase`・`isBusyPhase` | 準備・作業中・圧縮の前後 |
| 実行の決まり | `step`・`RunEvent`・`Effect` | 出来事から状態と命令を決める |
| 実行の殻 | `ChatRunner`・`ChatRun` | 命令を実行する |
| 送信待ち / 預かり | `Outbox`・`QueuedMessage`・`chat_outbox` | あとで送る / いまの作業のあと先に送る |
| 送信待ちの操作 | `QueueCommand`・`applyQueueCommand` | 並べ替え・消す・止めるを 1 つの関数で |
| 預かる理由 | `HoldReason`・`holdOf` | 自動で送らない理由（門） |
| 起動したときの再開の確かめ | `RestartResume`・`resume_pending` | 途中で止まったチャットを続けるか聞く |
| 実行に足すもの | `TurnContributor`・`addTurnContributor` | 上の機能が 1 回の実行に足す |
| 作業の終わりの予約 | `reserveAtTurnEnd`・`TurnEndTask` | 自分を含む操作を終わりに行う |
| 末尾 / 索引 | `CHAT_TAIL_TURNS`・`selectIndexIds` | 開くときに読む最新のターンと、全体から作る印 |
| 書きかけの返答 | `StreamingTexts`・`chat_delta` | 確定する前の AI の文 |
| 未読 / 既読 | `unread` / `read` | 画面が一番下まで見たら既読 |
| チャットの選択 | `ChatOptions`・`resolveChatOptions` | モデル・深さ・権限・ファスト |
| 権限モード | `PermissionMode` | |
| 圧縮前指示 / 圧縮後指示 | `pre_compact_prompt`・`post_compact_prompt` | 圧縮の前後に AI に送る指示 |
| コンテキストの消去 | `context_cleared` | 会話を AI に引き継がない区切り |
| グループ | `ChatGroup`・表 `chat_groups` | |
| フィード | `FeedItem` | 全プロジェクトの画面の、チャットごとの返答 |
| チャットの状態 | `chatStateOf`・`STATE_STRENGTH` | 印・色・文の決まりは 1 つの表 |
| 急ぎの順 | `URGENCY_ORDER` | ボードの列とスマホの一覧の並び |
| メインエージェント / サブエージェント | `SubagentEntry`・`subagentTree` | サブの上は「起動したエージェント」 |
| AI | `ProviderId`・`AgentProvider` | チャットを動かす CLI。チャットごとに決める |
| AI によってできること | `ProviderCapability` | できないものは理由を出す |
| AI を替えて続ける | `providerHandoff`・`chat_provider_sessions` | 会話を別の AI に引き継ぐ |
| AI のログインの仕方 | `ProviderAuthMode` | サブスク / API キー |
| AI の操作ツール | `defineAiTool`・`AiToolGroup`・`McpToolHost` | Kickoff が AI に渡すツール |
| 守り | `ToolGate`・`guardWrites` | ツールの形によらず当てる判定 |
| AI の Bash の砂場 | `bashSandboxFor` | 書けるフォルダを絞る |
| 図 | `Visual` | AI が返答の中に描く SVG・HTML |
| 利用者が見ているもの | `UserView` | AI が読む、この Mac の画面 |
| AI からの知らせ | `notify_user` | 長い作業の区切りを知らせる |
| タブの入れ物 | `Panel`・`panelTabs` | パネル・チャット欄・下のパネル |
| 欄 | `panelSurfaces`・`surface` | 入れ物の置き場所（DB の場所は `scope`） |
| チャットの置き場所 | `ChatHost`・`ChatScreen` | タブ・右の欄・別ウィンドウの違いを 1 つの値に |
| 右サイドバー | `SideView` | 画面の右端の欄 |
| プロジェクトの画面 | `projectViews` | プロジェクトの上のタブ |
| メインウィンドウ / 別ウィンドウ | `popoutKinds`・`PopoutApp` | |
| 開く | `open`・`OpenTarget`・`openTargets` | 行き先の表 |
| 拡張点 | `definePoint`・`contributes` | 入れ物が口を宣言し、機能が登録する |
| 画面の保存 | `defineSettings`・`useSetting` | 宣言していないキーは起動で消える |
| アプリの設定 | `setting`・`AppSettings` | 機能ごとに宣言する |
| 土台の束 / 機能 | `Kernel`・`CoreFeature` | コアの機能は `createX(k, deps, env)` |
| 取り決め | `Contract`・`implement`・`client` | 表を 1 回書いて両側を作る |
| 呼び主 / 呼び手 | `Caller`・`ApiClient` | コアから見た相手 / 画面の呼び出し |
| プロジェクトフォルダ | `repo_path` | ワークツリーと並べるときだけ「本体」 |
| 作業場所 | `Workplace`・`WorkplaceKit`・`WorkplaceCreator` | 本体かワークツリーか |
| 作業フォルダ | `workdirOf`・`worktree_path` | そのチャットの AI が作業する所 |
| 作業場所を移す | `move_workplace`・`workplace_moved` | チャットの作業場所を変える |
| 定型文 | `Snippet` | 共通かプロジェクトだけ |
| 添付 / AI に渡す | `Attachment`・`handOffTargets` | |
| ノート | `Note`・`note_path` | プロジェクトの外のフォルダに置く |
| ゴミ箱 | `TrashItem`・`registerKind` | 種類は各機能が登録 |
| DB 接続 | `DbConnection` | パスワードは `secrets` |
| Docker のサービス | `DockerServiceInfo` | |
| ワークツリーの実行環境 | `WorktreeEnv` | ポートの番号など |
| ポートを使っているプロセス | `PortProcess` | |
| 外の画像 | `RemoteImage` | 押したら表示 |
| 本体 / スマホ連携 | `DeviceAccess`・`mobile_enabled` | スマホから見た Mac の Kickoff |

## 6. 決めたこと

作らなかった形・選んだ形と、その根拠の数。

| 項目 | 決めたこと |
|---|---|
| 保存データ | 引き継がない。知らない版の DB は開かずに止まる。古い DB・古いキーを読む・写す・消すコードは持たない |
| 機能 | 使っていない機能・設定も消さない（候補は報告にだけ書く） |
| AI | API キーを前提にしない（Claude などのサブスクで使えるものだけ）。AI の ID は閉じた一覧（開いた登録にしない） |
| 取り決めに zod を入れない | スマホ・preload・画面の束に入れないため。zod はコアとメインの受け口だけ |
| npm のワークスペースにしない | スマホの React の版と EAS Build が別のまとまりを前提にするため |
| 境界の検査は自前 | TypeScript 7 で ESLint 系が素直に動かないため（`scripts/check-structure.mjs`） |
| CSS Modules・入れ子を採らない | 行が減らず、危なさが増える |
| エディタ | ファイルは Monaco、ノート・SQL は CodeMirror |
| スマホのアプリ | パッケージ名 `app.ade.kickoff` を変えない。`EXPO_PROJECT_ID` を変えると端末のプッシュ用 ID が使えない。プロジェクトの ID と `google-services.json` は EAS の環境変数、署名の鍵はリポジトリに入れない。ファイル・Git の変更はスマホに開かない |

測った数:

- 会話の流れの窓（`useRowWindow`）はライブラリに替えない（選択・コピー・`scrollIntoView`・スクロールアンカーを保つ）。数千ターンで要素が 10 万個を超えて画面が真っ黒になったが、窓にすると上へ 50 画面読み進めても約 200 個。
- 読んでいた位置はブラウザのスクロールアンカーに任せ、いちばん上で前に増えたときだけ JS で直す。JS だけで保つ形と比べ、上へ読み進めたときのずれが最大 0.7px 対 3,300px。
- サイドバー・ボードは窓にせず、開いた直後だけ段階に分けて描く（`useProgressivePage`。⌘F・キーの移動・ドラッグが全部の行を前提にする）。1,000 チャットで最初に見えるまで、サイドバー 144〜270ms → 29〜51ms・ボード 226〜378ms → 30〜113ms（`scripts/perf/lists.mjs`）。
- 記録が届いたときは記録全体から作り直す（`defineChatSelector`）。約 1,600 件で 0.3ms（95% で 0.8ms）なので、届いた分だけ計算する形は作らない。
- 裏のタブの会話の欄は `Activity` の hidden で止める。裏に 6 つ開いて表で返答を書かせながら打つと、1 文字の遅れが中央値 22ms → 15ms。
- 一番下への付いていきは、大きさの知らせの中でずれたときだけ寄せる（effect で毎回 `scrollTop` を書くと 1 文字に約 50ms）。
- macOS の音声認識が使えるかは毎回聞く（約 0.1 秒で終わるので覚えない）。
