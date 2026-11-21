# チャットの背骨（`src/features/chat`）

チャット = 保存される会話（`Chat`・表 `chats`）、1 回の実行（Turn）= 送ってから終わるまで、記録 = `ChatEvent`（表 `chat_events`）。コアの実行は `core/`、画面の店・状態の印・操作は `ui/`。プロバイダーは `src/features/ai/CLAUDE.md`、AI の操作ツールの口は `src/foundation/core/CLAUDE.md`。

## 全体

| ファイル | 中身 |
|---|---|
| `core/runner.ts`・`runnerQueue.ts` | 受付 `Runner`（API から呼ぶ窓口）と、送信待ちの操作の土台 `RunnerQueue` |
| `core/runtime.ts`・`runtimes.ts` | チャットごとの作業中の状態 `ChatRuntime`（出す箱だけ保存する） |
| `core/turn.ts` | 1 回の実行 `executeTurn`・プロバイダーに渡すもの `buildTurnParams`・結果の反映 `applyResult` |
| `core/input.ts` | チャットの作成と続きの指示の下ごしらえ（名前・添付の見出し `@/features/attachments/core/attachmentNotes.ts`・届かなかった報告） |
| `core/deltaStage.ts`・`streamingTexts.ts`・`chatLogQuery.ts`・`chatIndexCache.ts` | 書きかけの返答・記録の読み方（下の「チャットの記録の読み方」） |
| `ui/store/` | 画面のチャットの店（詳細・記録・一覧 `knownChats.ts`） |
| ほか | 下の同じ名前の節 |

- 作業中（`isBusy`）= 実行中（`turn`）か送る準備中（`preparing`）。作業中にできない操作（送る・削除・分岐・巻き戻し・移動・アーカイブ）は `requireIdle` で 409。
- 作業中かを確かめてから動かし始めるまで（`await` の間も）`preparing` で数える（理由は `ChatRuntime` のコメント）。
- 作業中の状態は `ChatRuntime` に集め、モジュールの変数に持たない。チャットを消したら `forget` で捨てる。
- 選択は `resolveChatOptions`（送るときの指定 → その AI のプロジェクトの既定 → アプリの既定）。Claude Code 以外は一覧にないモデル名を実行の前にも外す（`knownModel`）。
- 砂場と編集先の制限は、チャットを作るときにアプリの既定を書く（既存のチャットは変わらず、分岐は元を引き継ぐ）。
- AI へ送る定型文（自分の発言として残る）は `@shared/chat/prompts` に置き、コアと画面で同じものを使う。
- 終えるとき `Runner.shutdown` は止める前に作業中のチャットへ `chats.resume_pending` を付け、待たずに DB を閉じる。抜けた `result`（ターンの境目）は起動のとき `endInterruptedTurns` が足す。

## 送る・伝える

- `start` はチャットを作ってすぐ動かし、`send` は作業中なら 409。名前は 1 行目で付けて AI にも付けてもらう（その間に変わっていれば置き換えない）。
- `tell` は作業中ならいまのやり取りに足す（口ができるまで `TELLABLE_WAIT_MS` 待つ）。結果は `told` / `queued` / `sent` / `held`。
- 足せなければ送信待ちに戻さず預かり、作業の終わりに `deliverHeld` が送信待ちより先に送る（理由は `runner.ts` のコメント）。以後の「いま」も `tellsClosed` で預かる。
- 「いま」を預かるかは `ChatRuntime.holdsTells` 1 つで決める。預かる場面を足したらここに足す。
- 発言の印（`MessageMarks`）はどの道でも `@shared/chat/handoff` の `marksOf` で通す。自分の発言 `user` には `message_uuid`（ファイルを戻す目印）を残す。
- 自分で送ったら再開の段取りをやめる（`forgetRecovery`）。質問として送る（`pause_after`）は `pauseAfterTurn` か `setStopAfter` の印にする。

## 1 回の実行（`core/turn.ts`）

- 作業場所は `workdirOf`（null なら本体）。送るたびと作業の終わり（結果を書く前。失敗でも）に、いまのブランチを `chats.branch` に覚える。
- 動かし始める前に止められたら、プロバイダーを動かさずに中断で終える（`turn.ts` のコメント）。
- `chat_delta`・`chat_subagent`・`chat_command_output` は配るだけで保存しない。失敗は投げずに、チャットの失敗（未読）と `error` の記録にする。
- 分岐の起点（`result` の `session_id` / `message_id`）は最後まで終わったときだけ残す。
- 終わったら（失敗・中断も）送信待ちの次を送る。アプリの終了・通信の切断・使用枠の上限で止まったときは送らない。
- 砂場の診断（`@/features/guard/core/sandboxDiagnostics.ts`）は実行ごとに作り、終わり・失敗・中断で必ず `close` する。

## 作業中の様子（ChatLive）

- 画面に配る形は `ChatLive`。詳細の `live` と SSE の `chat_live` を同じ形にし、変わるたびに丸ごと配る。保存しない。
- 停止（`cancel`）の `stopping` は、プロセスがサブエージェントごと終わるまで立てておく。

## 送信待ち（`core/runnerQueue.ts`）

- 送信待ち `later` と預かり `now` は出す箱 `Outbox` 1 つ。操作は `@shared/chat/outbox`・`queueCommand` の純粋な関数で、変わるたびに `chat_outbox` に丸ごと書く。
- 起動したときの再開の確かめ（`restartResume.ts`）を待つ間（`ChatRuntime.resume`）は送らない。
- `sendNextQueued` は作業中なら取り出さない（取り出すと送れずに消える）。
- 一時停止の印（`stops`）は列の位置で持つ（寄せ方・並べ替えは画面と同じ `@shared/chat/queueStops`）。
- 指示の代わりに挟む行（圧縮・消去）は `queueActionOf` で見分ける。チャット欄の `/clear` は送らずに消去にする（`isClearCommand` の JSDoc）。
- 書き直し中の先頭は送らずに待ち、知らせが `EDIT_HOLD_TTL_MS` 途絶えたら外す（預かりも同じ `setEditing`）。
- 応答はどれも変えたあとの `QueueState`。列にない指示は 404、送るものがないなどは 409。

## 止まったあとの再開（`core/recovery/`）

- 通信の切断と使用枠の上限は 1 つの仕組み `ChatRecovery`。理由ごとの違い（待つ条件・文）は `core/run/machine/recovery.ts` の規則だけに書く。
- 止まると送信待ちを門 `gates.recovery` で止め、再開の作業が最後まで終わったら戻す。自分で送ったら待つ・聞くをやめる。門も待つ状態も保存しない。
- 枠が戻る時刻は、待つ時間でなく時計の時刻で見る（`poller.ts`）。

## 未読・承認と質問（`core/approvals.ts`）

- 未読の条件は `@shared/chat/state` の `isUnreadEvent`（`core/db/events.ts` の `latestUnreadId` が同じものを SQL で持つ。変えたら両方）。
- 既読（`POST …/seen`）は、画面が見た `event_id` より新しい結果があれば消さない。画面は一番下まで見た記録の ID を `api.markSeen` に渡し、既読にするのは自分で見たときだけ（`@/features/conversation/ui/timeline/useMarkSeen.ts`。返答が届いただけでは消さない）。印の付け外しで並び順（最後に動いた時刻）を変えない。
- 画面の状態は `chatStateOf`（`@shared/chat/state.ts` の `agentStateOf`）、色は `ui/state/tones.ts`。場所ごとに判定を書かない。
- 回答待ちは `ApprovalCenter` が持ち、回答まで実行は待つ。止められたら拒否で返す（あとの回答は 409）。回答の添付のパスは `answersWithAttachments` が書き添える。

## 巻き戻し・ファイルを戻す（`core/rewind.ts`・`core/sessionSwitch.ts`）

- 巻き戻しは、自分の発言より前のいちばん近い起点（`resumePointBefore`。消去・作業場所を移した区切りで止まる）から分岐し、後ろの記録と送信待ちを消して送り直す。
- `restore_files` はファイルを分岐より先に戻す（`rewindChat` の JSDoc）。`rewindFiles` は dryRun で測ってから戻し、消去のあとなら前のセッション（`sessionAt`）で戻す。
- 長いチャットの乗り換え（`switchAfterCompact`）は直近の区切りだけの新しいセッションに移り、`store.events.remapSession` で付け替える。失敗しても作業は止めない。

## AI の操作ツールの中身（ai*.ts）

| ファイル | ツール（`kickoff_chat`） |
|---|---|
| `core/tools/aiChatEdit.ts`・`aiChatRead.ts`・`aiChatRemove.ts`・`aiOpen.ts` | 家系・読む・アーカイブと削除・開くと下書き |
| `core/tools/aiProject.ts` | `add_snippet`・`move_note` |
| `@/features/userView/core/aiUserView.ts` | `get_user_view` |

ほかの機能のもの（`create_chat`・`notify_user`・`finish_worktree`・`move_workplace`・ターミナル・図）は各機能の `core/` にあり、下の決まりはどれにも当てる。

- 中身は `create…Tools(deps, chatId)` で作り、`chatTools.ts` が作業ごとに開く。1 回の作業の上限（`AI_CHATS_PER_TURN` など）はその中で数える。
- 相手（家系・プロジェクト・タブ）と設定・世代・深さは呼ぶたびに引き直す。ほかのプロジェクトは断る。
- 承認を聞くのは `create_chat`（設定が `ask`）と、持っていく変更のある `move_workplace` だけ（ほかは戻せる・読むだけ。理由は各ファイルの頭）。
- 自分を含む操作（自分のワークツリー・アーカイブ・作業場所）は予約して作業の終わりに行い、先に送信待ちを止める。予約はメモリだけ。
- 先にすべて確かめてから変える。作業中の相手は断り、待たない。画面に頼むもの（`open_view`・`chat_draft`）は開けたかを待たない。
- 結果の `createdChatMark` は画面が読む。読ませる会話・ターミナルの出力は資料と添え、鍵らしい値は `redactSecrets` で伏せる。

## ほかのチャットの記録・移動・削除・自動のアーカイブ

- ほかのチャットの記録（`transcript.ts`）は、自分の発言・メインエージェントの返答・変えたファイル・失敗・中断だけ。
- 別のプロジェクトへの移動は子孫ごと `Runner.moveWorkplace`（理由 `project_moved`）。
- 削除はゴミ箱へ（`src/features/trash/CLAUDE.md`）。本当に消すとき、ほかのチャット・ほかの Kickoff が使っていない会話記録だけを消す（`core/sessions/sessionCleanup.ts`）。
- 自動のアーカイブ（`autoArchive.ts`）は親のないチャットだけを見て、子孫も完了したまま日数がたてば子孫ごとしまう（未読・固定は除く）。

## チャットの記録の読み方（`core/routes/chats.ts`・`core/chatLogQuery.ts`）

- `GET /api/chats/:id` の `tail_turns` はほかのクエリと一緒に使えない（400）。一部分の `GET …/events` は `ChatEventsQuery` の 5 つの形だけ。どちらもパソコンの画面だけ。
- 記録の ID は使い回さない。`after` の記録が巻き戻しで消えていれば `after_missing`（画面はすべて読み直す）。
- ターンの頭は `result` の直後で、自分の発言で数えない（作業中に伝えた発言で切ると、作業の終わりに付けるものが欠ける）。
- 索引は覆う索引の軽い形から `@shared/chat/chatIndex` の `selectIndexIds` で選ぶ（SQL に書き直さない）。覚え（`core/chatIndexCache.ts`）は巻き戻し・付け替え・削除で `store.logRevisions` を受けて捨てる。
- 詳細には書きかけの返答 `streaming_text` を入れる。あとに届く `chat_delta` は `offset` で、詳細に入っている分を捨てる。

## 操作・名前・メニュー（`ui/`）

- アーカイブ・削除・移動などは `ui/chatActions.ts` を通す。アーカイブ・削除は既定の閉じ方でも必ず確かめる（取り消しの通知で代えない）。
- 削除したチャットの書きかけ（`chatDraft`・`chatAttachmentsDraft`）も消す。
- 名前はその場で `useChatRename` ＋ `ChatTitleInput` で変える（ダイアログを使わない）。上限は `CHAT_TITLE_MAX`（コアの検証と共通）。
- 右クリックの項目は `ChatMenuItems` 1 つ（サイドバー・ボード・タブで同じ並び）。下書きは `DraftMenuItems` で、同じ並び・文・アイコンにする。
- 「新しいチャット」の作成先の札は `useNewChatPlace` ＋ `NewChatPlaceBadges`。まとまりからの作成先は `@/features/chatList/ui/buckets.ts` の `newChatPlaceOf`。
- ✕ は `closeChatWithChoice`（既定は `chat:close-action`）。Esc・タブの「閉じる」は聞かずに閉じる。
