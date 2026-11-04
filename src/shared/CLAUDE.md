# 共有の層（src/shared）の説明

コア（`src/core`）・メインプロセス（`src/main`）・preload・画面（`src/renderer`）のどこからも使う型と純粋な関数。import は `@shared/…`（tsconfig の `paths` と `electron.vite.config.ts` のエイリアス）。コアと画面は互いに import しないので、両方で使うものはここに置く。

## 決まり

- Node・DOM・Electron・React に依存しない（型・定数・純粋な関数だけ。コアと画面で同じ結果にする）。`ipc/` は zod にも依存しない（サンドボックスの preload に束ねるため）。
- 名前: HTTP API・SSE・DB に出る形（`@shared/types` の型。設定の `AppSettings` も）は snake_case。コードの変数・関数、画面の中だけの型、Electron の IPC の形（`@shared/ipc`）は camelCase。外のツールの形をそのまま写すもの（Claude Code の AskUserQuestion の `multiSelect` など）はそのまま。
- 「ない」は `null`（空文字で「本体」「不明」を表さない。`worktree_path` が null なら本体）。
- 状態などの値の一覧は `as const` の配列から型を作り（`CHAT_STATUSES` → `ChatStatus`）、画面の文言は同じ場所の `…_LABELS`（`BOARD_COLUMN_LABELS` / `AGENT_STATE_LABELS` / `PERMISSION_LABELS` / `EFFORT_LABELS` など）に置く。DB の CHECK にはしない。
- テストは同じフォルダの `*.test.ts`。

## フォルダ

- `types/`: API・SSE・DB の形（入口は `index.ts`）。`chat`（`Chat`・`ChatGroup`・`ChatOptions`・`QueuedMessage`・`Attachment`・カンバンの列と状態）/ `chatEvent`（記録）/ `chatLive`（作業中の様子 `ChatLive`・`QueueState`）/ `project` / `approval` / `settings`（`AppSettings`・`DEFAULT_SETTINGS`・プロバイダー・推論の深さ・権限モード）/ `provider`（CLI の状態・使用枠）/ `git` / `voice` / `server`（`ServerStatus`）/ `events`（SSE の `BusEvent`）/ `api`（API にだけ出る本文 `…Body` と応答の形。コアの zod は `satisfies` でこの型に合わせる）。
- `chat/`: チャットの決まり（状態と列 `state.ts`・選択の決め方 `chatOptions.ts`・サブエージェントの一覧 `subagents.ts` / `subagentSupersede.ts` / `backgroundTasks.ts`・送信待ちの印 `queueStops.ts`・書き直しの持ち時間 `queueEditHolds.ts`・失敗の見分け `networkErrors.ts` / `usageLimit.ts`・AI への定型文 `prompts.ts`）。
- `project/`: プロジェクトの色（`colors.ts` の `PROJECT_HUES` と `pickProjectHue`。グループの色も同じ選び方）とタグ（`tags.ts` の `normalizeTags` / `matchesTags` / `collectTags`・`MAX_TAG_LENGTH` / `MAX_TAGS`・タグなしを表す `UNTAGGED`）。
- `ipc/`: Electron の IPC の取り決め（→「IPC の取り決め」）。
- `testing/factories.ts`: テストのデータを作る関数（`makeChat` / `makeProject` / `makeGroup` / `makeEvent` / `eventSequence`。省いた項目はそれらしい既定値で埋める）。コアと画面のテストで共通にし、テストごとに作る関数を書かない。
- `errors.ts`: `errorMessage`（例外を画面に出す文にする。`e instanceof Error ? e.message : String(e)` を書かない）。

## 記録（ChatEvent）

- `chatEvent.ts` の `ChatEventData` は `type` で中身が決まる判別共用体。保存した 1 件は `ChatEvent`（`id` / `chat_id` / `type` / `data` / `created_at`）で、`if (e.type === "text")` で `e.data.text` が読める。`event.data as …` と書かない。
- 絞ったあとの形を引数・入れ物の型に書くときは `ChatEventOf<"result">`、中身だけなら `ChatEventDataOf<T>`（形が 2 つある `approval_resolved` は union のまま。ふつうの `Omit` は union を 1 つに混ぜて絞り込めなくなるので、`DistributiveOmit` を使う）。
- 主な型: `user`（`message_uuid` は必須。`handover` は添えて渡した報告の行のキー）/ `text`・`thinking`・`tool_use`・`tool_result`（`parent` があればサブエージェントのもの）/ `approval` / `approval_resolved`（`action` で回答の形が決まり、`answer` なら選んだままの回答と添付）/ `result`（終わり方・`network`・`usage_limit`・分岐の起点の `session_id` / `message_id`）/ `error`・`notice` / `compact` / `subagent`。新しい DB から始めたので、以前の記録のための任意の項目は持たない。型を足すときは、プロバイダーが `emit` で送る形か（`user` / `approval` / `approval_resolved` / `result` 以外）も考える。

## 選択（ChatOptions）

- モデル・推論の深さ・権限モード・ファストモードは `ChatOptions`（`model` / `effort` / `permission_mode` / `fast_mode`）1 つの形。送るとき・送信待ち・プロジェクトの既定は、その一部（`ChatOptionsPatch`）。
- 決め方は `chatOptions.ts` の `resolveChatOptions(settings, project, override)`: 設定の `chat_defaults` の上に、プロジェクトの `chat_defaults` → 送るときの指定の順に、書いてある項目だけを重ねる（undefined は次の段に従う）。`model` / `effort` の null は「指定しない」（SDK とモデルの既定）として残す。アプリの既定の権限モードは「毎回確認」（`default`）。

## 状態と列（state.ts）

- `agentStateOf(chat, hasPendingApproval)`: 回答待ち → エラー（失敗してまだ見ていない）→ 作業中 → 未読 → 既読の順に決める。回答待ちはチャットの状態に持たず、回答待ちの一覧から決める。
- `boardColumnOf(state)`: カンバンの列（作業中 / 回答待ち / 未読 / 既読）は AI の状態だけで決まり、人は動かさない。失敗も見るまでは未読。終わったかより、結果を見たかで分ける。
- `isUnreadEvent`: 未読にする記録（メインの AI の文章の返答・作業の終わり・失敗。ツールの実行などの途中経過では付けない）。コアの `store.events.latestUnreadId` も同じ条件で数える。
- `busyWithUnread`: 作業中のまま未読（列・数は作業中のまま、印に未読の点を重ねる）。

## サブエージェントの数え方（subagents.ts）

- `collectSubagents(events, progress, busy, live?)`: Task / Agent の呼び出しと結果・開始と終了の知らせ（記録）と、画面にだけ届く途中経過（`progress`）から一覧（`SubagentEntry`）を作る。行は作業 ID（`agentId`）でまとめる（SendMessage で再開すると、知らせの呼び出し ID が再開を頼んだ SendMessage のものになるため）。作業中でなければ、終わっていないものは中断とみなす。`live`（いま裏で動いている作業）から消えたものは終わったとみなし、報告を渡していれば完了、なければ中断。裏で動かしたときの起動の知らせ（`backgroundTasks.ts` の `isBackgroundLaunch`）は完了と数えない。
- 入れ子: サブエージェントが起動したサブエージェントは、起動したほうの行のキーを `parentKey` に持つ（Agent の呼び出しの記録の `parent`）。SendMessage で再開した回の中の記録は parent が再開を頼んだ SendMessage の ID になりうるので、その ID を `aliases` に覚えて元の行のものとして数える。子孫の動き（発言・ツール・知らせ）は祖先の `lastActivityAt` にも伝え、子の結果を待っている親を「動きがない」としない。時刻は、初めに起動した `startedAt` と、いちばん新しい回が止まった `endedAt`（作業中は undefined）。
- 行が持つもの: 通信の切断で止まった `network`、報告が親に届いたか `delivery`（`received` = 待つ形ならツールの結果が返った・裏で動かしたなら報告のあとに親が動いた / `pending` = 親がまだ動いていない / `lost` = 親が動かないまま作業が終わった）と、届かなかった本文 `undeliveredReport`、出力の上限で止まった `outputLimit`（`isOutputLimitError`）、最後に動いた時刻 `lastActivityAt` と結果待ちのツール `pendingTool`、やり直された `supersededBy`。
- やり直し済み（`subagentSupersede.ts` の `markSuperseded`）: 止まった行のあとに始まり、種類が同じで、説明（短い方に対する重なり）と依頼文（Dice 係数）の 2 文字の組がどちらも半分以上重なるもの。同時に始めた似た依頼は止まる前に始まっているので数えない。
- 報告の本文（`subagentReport`）は、SubagentHandback の本文 → 終わりの知らせの要約 → ツールの結果の順に探す。
- コアの作業の終わりのお知らせ（`unfinishedSubagents`）・通信が戻ったときの再開（`networkStoppedSubagents`）・届かなかった報告の受け渡し（`core/chat/reportHandover.ts`）も、画面の一覧と同じこの数え方を使う。数え方を変えるときは両方に効く。

## そのほかのチャットの決まり

- `queueStops.ts`: 送信待ちの一時停止の印の位置（0 = 1 件目の上、n = n 件目のあと）の整え方 `normalizeStops`・列が変わったときの寄せ方 `remapStops`・印の線を見た目の 1 行として扱う並べ替え `moveToSlot`。コアの `ChatQueue` と、画面の「動かすと変わるか」で同じものを使う。
- `queueEditHolds.ts` の `EDIT_HOLD_TTL_MS`: 送信待ちを書き直している印の持ち時間（コアが覚え、画面はこれより短い間隔で知らせ直す）。
- `networkErrors.ts` の `isNetworkError`・`usageLimit.ts` の `isUsageLimitError` / `resetTimeOf` / `exhaustedResetOf`: 失敗の文・Claude Code の知らせ・使用枠から、通信の切断と使用枠の上限を見分け、枠が戻る時刻を決める。
- `prompts.ts`: AI へ送る定型文（送るとチャットに自分の発言として残る）。止まったあとの再開（`resumePrompt` / `USAGE_RESUME_PROMPT`）・続きから再試行（`RETRY_PROMPT`）・サブエージェントへの指示（`relayMessage` / `relayedText` / `resumeRequest` / `retryRequest` / `HAND_OVER_NOW`）。文を手で組み立てずに、ここに足して使う。

## IPC の取り決め（ipc/）

- `contract.ts` の `NATIVE_API` が、画面に出すネイティブ機能（`window.kickoff`。デスクトップアプリだけにあり、スマホのブラウザにはない）の唯一の一覧: まとまり → 名前 → 種類（`invoke` = 呼んで返事を待つ / `send` = 送るだけ / `event` = メインから画面への知らせ。名前は `on…`）と引数・戻り値の型。チャンネル名は `channelOf` / `ipcEntries` が「種類:まとまり.名前」で作り、手書きしない。画面の側の型は `NativeApi`。
- 値は種類だけを持つ（型の引数は必ず書く）。引数の形の確かめ（zod）はメインの `main/ipc/args.ts` にあり、取り決めと形が違えば typecheck で分かる。中身の型（通知・ターミナル・拡張機能・性能の記録・外のアプリ）は同じフォルダの各ファイル。
