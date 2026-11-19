# 共有の層（src/shared）の説明

コア・メインプロセス・preload・画面・スマホのどこからも使う型と純粋な関数。import は `@shared/…`。コアと画面は互いに import しないので、両方で使うものはここに置く。

## 決まり
<!-- 行き先: ルートの CLAUDE.md（「層と依存の向き」） -->
- Node・DOM・Electron・React に依存しない（型・定数・純粋な関数だけ）。`ipc/` は zod にも依存しない（サンドボックスの preload に束ねるため）。
- コアと画面（とスマホ）で同じ結果にする決まりはここに 1 つだけ書き、それぞれの側で書き直さない。
- 例外の文は `errors.ts` の `errorMessage`（`e instanceof Error ? e.message : String(e)` を書かない）。テストは同じフォルダの `*.test.ts`。

## フォルダ
<!-- 行き先: 消す（地図だけ。database/ の行は src/features/database/、devices/ の行は src/features/devices/） -->
- `types/`: API・SSE・DB の形（入口は `index.ts`。`api.ts` の本文と応答の型に、コアの zod が `satisfies` で合わせる）。
- `chat/`: チャットの決まり（下の節）と、AI のツールの名前・引数・記録の行の文（`ai*.ts`）。
- 機能ごと: `project/`・`note/`・`snippet/`・`search/`・`database/`・`attachment/`・`secrets/`・`markdown/`・`links/`・`files/`・`docker/`・`github/`・`api/`（版の互換）・`devices/`・`theme/`・`ipc/`。同じものを使う側は各ファイルの頭のコメント。
- `testing/`: テストからだけ使う補助（`factories.ts`・`chatScenarios.ts`・`fakeScheduler.ts`・`async.ts`）。

## 記録（ChatEvent）
<!-- 行き先: src/features/chat/ -->
- `ChatEventData` は `type` で中身が決まる判別共用体。`if (e.type === "text")` で絞り、`event.data as …` と書かない。
- 絞った形は `ChatEventOf<"result">` / `ChatEventDataOf<T>`。union から項目を外すのは `DistributiveOmit`（`Omit` だと絞り込めなくなる）。
- 型を足すときは、プロバイダーが `emit` で送る形か（`user` / `approval` / `approval_resolved` / `result` 以外）も考える。

## 選択（ChatOptions）
<!-- 行き先: src/features/ai/ -->
- 決め方は `chatOptions.ts` の `resolveChatOptions` 1 つ（アプリの既定 → プロジェクトの既定 → 送るときの指定の順に、書いた項目だけを重ねる）。

## 状態と列（state.ts）
<!-- 行き先: src/features/chat/ -->
- 状態は `agentStateOf`、カンバンの列は `boardColumnOf`（AI の状態だけで決まり、人は動かさない）。回答待ちはチャットの状態に持たない。
- 未読の条件 `isUnreadEvent` は、コアの `store.events.latestUnreadId` が SQL で同じものを書いている（変えたら両方）。

## サブエージェントの数え方（subagents.ts）
<!-- 行き先: src/features/subagents/ -->
- `collectSubagents` は、コア（作業の終わりのお知らせ・再開・報告の受け渡し）と画面が同じ数え方を使う。変えたら `subagents.test.ts` と `chatIndex.test.ts` を通す。

## 末尾と索引（chatIndex.ts）
<!-- 行き先: src/features/chat/ -->
- 画面は記録の末尾だけを読み、それより古い記録は索引で受ける。記録全体から作る関数には、索引 ＋ 末尾を `mergeById` で重ねたものを渡す。
- 選ぶ規則は `selectIndexIds` 1 か所（コアの `buildIndex` も画面も通す。SQL に書き直さない）。
- 規則を変えたら、`chatIndex.test.ts` の「どの切れ目の索引 ＋ 末尾でも全件と同じ」を通す。記録全体から作る関数を足したら、このテストにも足す。

## そのほかのチャットの決まり
<!-- 行き先: src/features/chat/ -->
- 送信待ちの止める印は `queueStops.ts`（コアの並べ替えと画面の落とした形の予測が同じ関数）、書き直しの印の持ち時間は `queueEditHolds.ts`。
- 書いている途中の返答の足し・消しは `streamingRules.ts`（コア・画面・スマホが同じ関数）。通信の切断・使用枠の上限は `networkErrors.ts`・`usageLimit.ts`。
- AI へ送る定型文は `prompts.ts`、子チャットから親への受け渡しは `handoff.ts`。文を手で組み立てずに、ここに足して使う。

## IPC の取り決め（ipc/）
<!-- 行き先: src/foundation/desktop/ -->
- `contract.ts` の `NATIVE_API` が、画面に出すネイティブ機能（`window.kickoff`。デスクトップだけ）の唯一の一覧。チャンネル名は `channelOf` で作り、手書きしない。
- 値は種類だけを持つ（型の引数は必ず書く）。引数の zod はメインの `@/foundation/desktop/ipc/args.ts`（形が違えば typecheck で分かる）。中身の型は同じフォルダの各ファイル。
