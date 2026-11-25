# チャットの実行（`features/chat/core`）

送ってから終わるまでの 1 回の実行と、送信待ち・再開・巻き戻し。純粋な `step`（出来事 → 状態と命令）と、命令を実行する殻 `ChatRunner`。

## 地図
- `run/machine/`: `step`・型 `types.ts`・預かる理由 `state.ts`（`holdOf`）・終わりにすること `turnEnd.ts`・再開の決まり `recovery.ts`
- `run/chatRun.ts`: チャットごとの `ChatRun`（`run` は `step` の答えだけで変わる。出す箱だけ保存する）
- `run/turn/`: 1 回の実行（`execute`・`params`・`providerEvents`・`result`）。`run/recovery/`: 見張り・カード（殻）
- `input.ts`（作る・続きの準備）・`rewind.ts`・`sessionSwitch.ts`・`tools/`（`kickoff_chat` の組）・`transcript.ts`・`autoArchive.ts`

| 状態機械 | 中身（`run/machine/types.ts`） |
|---|---|
| 状態 `Phase` | `idle` → `preparing` → `turn`（`tell` の口・`compaction`）→ `settling` → `idle` |
| 出来事 `RunEvent` | 利用者（`send`・`queue`・`queue_send`・`editing`・`cancel`・`compact`・`clear`）・実行（`turn_started`・`tell_*`・`compacting`・`turn_ended`・`settled`）・再開（`online`・`clock`・`answer_*`）・門 |
| 命令 `Effect` | `start_turn`・`tell`・`abort_turn`・`record`・`reply` / `reject`・`watch`・`ask_recovery`・`run_turn_end_tasks` |

## 決まり
- 作業中（`isBusy`）= `phase` が `idle` でない。定義はこれ 1 つ。作業中にできない操作は `requireIdle` で 409、用意して確定する流れは `withIdleChat`。
- 送る口は `message`（`when`）1 本と `queue`・`queueSend`。`now` は預かりに置き、口ができたら頭から足す（結果 `told` / `queued` / `sent` / `held`）。発言の印はどの道も `marksOf`。
- 送信待ちと預かりは出す箱 `Outbox` 1 つで、変わるたびに `chat_outbox` に丸ごと書く。起動の確かめ（`gates.restart`）・止まったあと（`gates.recovery`）は送らない。門は保存しない。
- 上の機能は `addTurnContributor` で実行に足す（order の順。門・砂場・圧縮前指示は 1 つ）。`afterTurn` は集める前の失敗でも 1 回呼ぶ。
- 選択は `resolveChatOptions`。砂場と編集先の制限は作るときにアプリの既定を書く（分岐は元を引き継ぐ）。
- 分岐の起点は最後まで終わったときだけ残す。巻き戻しは区切りの手前を断る（`@shared/chat/boundaries`）。
- AI のツールは呼ぶたびに相手・設定・深さを引き直し、先に確かめてから変える。自分を含む操作は `reserveAtTurnEnd` で終わりに。承認を聞くのは `create_chat`・`move_workplace` の carry・ほかのプロジェクトへの書き込み。

## 落とし穴
- `chat_delta` はほかの知らせより先に配る（詳細の `streaming_text` と `offset` で重なりを捨てる）。失敗は投げずに未読の失敗と `error` の記録にする。
- `ChatLive` は詳細の `live` と SSE の `chat_live` が同じ形で、変わるたびに丸ごと配る（`status` が変われば `chat` の直後も）。
- 終えるとき `shutdown` は作業中のチャットに `resume_pending` を付け、待たずに DB を閉じる。抜けた `result` は起動のとき `endInterruptedTurns` が足す。
- `chats.active_at`（一覧の並び）を進めるのは `status` を変える更新だけ。ゴミ箱のチャットは `store.chats` の読み取りから外す（足すときも。`sessionInUse` は数える）。
- 起動のとき作業中のまま残ったチャットは未読の失敗にし、止まった印のあるものを再開の確かめに渡す（`recoverInterrupted`）。
- ターンの頭は `result` の直後（自分の発言で数えない）。`after` の記録が消えていれば `after_missing`。
- 枠が戻る時刻は待つ時間でなく時計の時刻で見る。
- テスト: `run/machine/step.test.ts`・`run/scenarios.runner.test.ts`・`routes.*.test.ts`。
