# チャットの背骨（`src/features/chat`）

チャット = 保存される会話（`Chat`・表 `chats`）、1 回の実行（Turn）= 送ってから終わるまで、記録 = `ChatEvent`（表 `chat_events`）。コアの実行は `core/`、画面の店・状態の印・操作は `ui/`。プロバイダーは `src/features/ai/CLAUDE.md`、AI の操作ツールの口は `src/foundation/core/CLAUDE.md`。

## 全体

| ファイル | 中身 |
|---|---|
| `core/run/machine/`・`core/run/` | 純粋な `step`（出来事 → 状態と命令）と、命令を実行する殻 `ChatRunner` |
| `core/run/chatRun.ts`・`chatRuns.ts` | チャットごとの作業中の状態 `ChatRun`（出す箱だけ保存する） |
| `core/run/turn/` | 1 回の実行（`execute`・`params`・`providerEvents`・`result`）。`RunnerDeps` を受ける |
| `core/input.ts` | チャットの作成と続きの指示の準備（名前・添付 `ChatAttachments`・届かなかった報告） |
| `core/family.ts` | 家系のたどり方（ほかで書かない） |
| `core/deltaStage.ts`・`streamingTexts.ts`・`chatLogQuery.ts`・`chatIndexCache.ts` | 書きかけの返答・記録の読み方 |
| `core/routes/` | 受け口（取り決めは `@shared/chat/contract.ts`） |
| `ui/store/` | 画面のチャットの店・知っているチャット `knownChats.ts`（一覧 ∪ 詳細で見たもの）・回答待ち `approvals.ts`・取り出し口 `defineChatSelector` |
| ほか | 下の同じ名前の節 |

- 作業中（`isBusy`）= `phase` が `idle` でない（準備・作業の終わりにすることも）。`chats.status` の結果は `idle` に戻るときに書く。作業中にできない操作は `requireIdle` で 409。用意して確定する流れ（巻き戻し・移動など）は `withIdleChat`（`run/idle.ts`）。
- 状態は `ChatRun`（`run` は `step` の答えだけで変わる）。モジュールの変数に持たない。消したら `forget`。作業の始まりと終わりは `onTurnStarted`・`onTurnEnded` で聞く。
- 選択は `resolveChatOptions`（送るときの指定 → その AI のプロジェクトの既定 → アプリの既定）。Claude Code 以外は一覧にないモデル名を実行の前にも外す（`knownModel`）。
- 砂場と編集先の制限は、チャットを作るときにアプリの既定を書く（既存のチャットは変わらず、分岐は元を引き継ぐ）。
- AI へ送る定型文（自分の発言として残る）は `@shared/chat/prompts` に置き、コアと画面で同じものを使う。
- 終えるとき `shutdown` は止める前に作業中のチャットに `chats.resume_pending` を付け、待たずに DB を閉じる。抜けた `result` は起動のとき `endInterruptedTurns` が足す。

## 送る・伝える

- 送る口は `message`（`POST …/messages` の `when`）1 本で、`send`・`tell`・`queueMessage`・`/tell` は別名。`start` は作ってすぐ動かし、`when` なしは作業中なら 409。名前は 1 行目で付け、AI にも付けてもらう（その間に変われば置き換えない）。
- `tell` は作業中なら預かりに置き、口ができたら頭から足す（`pumpNow`）。結果は `told` / `queued` / `sent` / `held`（口がまだなら置いた時点で `held`）。
- 足せなければ預かり、作業の終わりに送信待ちより先に送る（以後の「いま」も `closed` で預かる）。理由は `holdOf` 1 つ（`machine/state.ts`）。
- 発言の印（`MessageMarks`）はどの道も `marksOf`（`@shared/chat/handoff`）で通す。自分の発言 `user` には `message_uuid`（ファイルを戻す目印）を残す。
- 自分で送ったら再開の段取りをやめる。質問として送る（`pause_after`）は `pauseAtHead` か `setStopAfter` の印にする。

## 1 回の実行（`core/run/turn/`）

- 作業場所は `workdirOf`（null なら本体）。送るたびと作業の終わり（失敗でも）に、いまのブランチを `chats.branch` に覚える。
- 動かし始める前に止められたら、プロバイダーを動かさずに中断で終える。
- 上の機能は `addTurnContributor` で足し（ツールは `CoreFeature.aiTools`）、order の順に集める。門・砂場・圧縮前指示は 1 つだけ。
- `chat_delta`・`chat_subagent`・`chat_command_output` は配るだけ。失敗は投げずに、チャットの失敗（未読）と `error` の記録にする。
- 分岐の起点（`result` の `session_id`・`message_id`）は最後まで終わったときだけ残す。
- 終わりにすることは `machine/turnEnd.ts` が決める（失敗・中断も次を送る。終了・通信切断・使用枠では送らない）。
- `afterTurn` は後の order から、集める前の失敗でも 1 回呼ぶ（引き継ぎを戻す）。

## 作業中の様子（ChatLive）

- 画面に配る形は `ChatLive`（段階 `phase`・預かる理由 `hold`。古い欄も同じ状態から）。詳細の `live` と SSE の `chat_live` は同じ形で、変わるたびに丸ごと配る（`status` が変われば `chat` の直後も）。
- `cancel` の `stopping` は、プロセスがサブエージェントごと終わるまで立てる。準備の間に止めたら、済んでも動かさない。

## 送信待ち（`core/run/queueWindow.ts`・`requests.ts`）

- 送信待ち `later` と預かり `now` は出す箱 `Outbox` 1 つ（`@shared/chat/outbox`・`queueCommand`）。変わるたびに `chat_outbox` に丸ごと書く。
- 起動したときの再開の確かめを待つ間（門 `gates.restart`）は送らない。`pumpLater` は作業中なら取り出さない。
- 一時停止の印（`stops`）は列の位置で持つ（`@shared/chat/queueStops`）。
- 挟む行（圧縮・消去）は `queueActionOf` で見分ける。チャット欄の `/clear` は送らずに消去にする（`isClearCommand`）。
- 書き直し中の先頭は送らずに待ち、知らせが `EDIT_HOLD_TTL_MS` 途絶えたら外す（預かりも）。
- 口は `POST …/queue`（`commands` は全部通るか 1 つも変えない）・`…/queue/send`・`PUT …/queue/editing`。1 件ごとの口は別名。

## 止まったあとの再開（`core/run/recovery/`）

- 通信の切断・使用枠の上限・起動したときの確かめの決まりは `machine/recovery.ts` 1 つ。殻 `ChatRecovery` は見張り・カード・送るだけ。
- 止まると送信待ちを門 `gates.recovery` で止め、再開の作業が最後まで終わったら戻す。自分で送ったらやめる。門は保存しない。
- 枠が戻る時刻は、待つ時間でなく時計の時刻で見る（`poller.ts`）。

## 未読・承認と質問（`core/approvals.ts`）

- 未読の条件は `@shared/chat/state` の `isUnreadEvent`（`core/db/events.ts` の `latestUnreadId` が同じものを SQL で持つ。変えたら両方）。
- 既読（`POST …/seen`）は、画面が見た `event_id` より新しい結果があれば消さない。画面は一番下まで見た記録の ID を `api.markSeen` に渡し、自分で見たときだけ既読にする（`@/features/conversation/ui/timeline/useMarkSeen.ts`）。印の付け外しで並び順を変えない。
- 画面の状態は `chatStateOf`（`agentStateOf` を包む）、文と色は `@shared/chat/stateLooks`。場所ごとに判定を書かない。
- 回答待ちは `ApprovalCenter` が持ち、回答まで実行は待つ。止められたら拒否で返す（あとの回答は 409）。回答の添付は `ChatAttachments.answers` がパスを添える。

## 巻き戻し・ファイルを戻す（`core/rewind.ts`・`core/sessionSwitch.ts`）

- 巻き戻しは、自分の発言より前のいちばん近い起点（`resumePointBefore`）から分岐し、後ろの記録と送信待ちを消して送り直す。区切りの手前は断る（`@shared/chat/boundaries`）。
- `restore_files` はファイルを分岐より先に戻す。`rewindFiles` は dryRun で測ってから戻す（消去のあとは `sessionAt`）。
- 長いチャットの乗り換え（`switchAfterCompact`）は直近の区切りだけのセッションに移る（`replaceSession`）。失敗しても止めない。

## AI の操作ツールの中身（`core/tools/`）

| ファイル | ツール（`kickoff_chat`） |
|---|---|
| `aiChatEdit.ts`・`read.ts`・`remove.ts`・`open.ts` | 家系・読む・アーカイブと削除・開くと下書き |
| `chatOpenTools.ts` | 開く組の chat の分（持ち主の組と交互に並ぶ） |

ほかの機能のツールは各機能の `core/`。下の決まりはどれにも当てる。

- 組（`AiToolGroup`）は作業ごとに開き（並びは `chatTools.ts`）、1 回の作業の上限も中で数える。
- 相手・設定・世代・深さは呼ぶたびに引き直す（呼んだチャットは `toolChat`）。ほかのプロジェクトは断る。
- 承認を聞くのは `create_chat`（設定が `ask`）と、持っていく変更のある `move_workplace` だけ（ほかは戻せる・読むだけ。理由は各ファイルの頭）。
- 自分を含む操作（自分のワークツリー・アーカイブ・作業場所）は `reserveAtTurnEnd`（`core/turnEnd.ts`）で終わりに行う（送信待ちを先に止める）。
- 先にすべて確かめてから変える（チャットを変える決まりは `update.ts`）。作業中の相手は断り、待たない。画面に頼むもの（`open_view`・`chat_draft`）は開けたかを待たない。
- 結果の `createdChatMark` は画面が読む。読ませる会話・ターミナルの出力は資料と添え、鍵らしい値は `redactSecrets` で伏せる。

## ほかのチャットの記録・移動・削除・自動のアーカイブ

- ほかのチャットの記録（`transcript.ts`）は、自分の発言・メインエージェントの返答・変えたファイル・失敗・中断だけ。
- 別のプロジェクトへの移動は子孫ごと（理由 `project_moved`。workplaceMove）。
- 削除はゴミ箱へ（`src/features/trash/CLAUDE.md`）。本当に消すとき、ほかで使っていない会話記録だけを消す。
- 自動のアーカイブ（`autoArchive.ts`）は親のないチャットを見て、子孫も完了のまま日数がたてば子孫ごとしまう（未読・固定は除く）。

## チャットの記録の読み方（`core/routes/chats.ts`・`core/chatLogQuery.ts`）

- `GET /api/chats/:id` の `tail_turns` はほかのクエリと一緒に使えない（400）。一部分の `GET …/events` は `ChatEventsQuery` の 5 つの形だけ。どちらもパソコンの画面だけ。
- 記録の ID は使い回さない。`after` の記録が巻き戻しで消えていれば `after_missing`（画面はすべて読み直す）。
- ターンの頭は `result` の直後で、自分の発言で数えない（作業中に伝えた発言で切ると、終わりに付けるものが欠ける）。
- 索引は覆う索引の軽い形から `selectIndexIds`（`@shared/chat/chatIndex`）で選ぶ（SQL に書き直さない）。覚え（`core/chatIndexCache.ts`）は `store.logRevisions` を受けて捨てる。
- 詳細には書きかけの返答 `streaming_text` を入れる。あとに届く `chat_delta` は `offset` で、詳細に入っている分を捨てる。

## 操作・名前・メニュー（`ui/`）

- アーカイブ・削除・移動などは `ui/chatActions.ts` を通す。アーカイブ・削除は既定の閉じ方でも必ず確かめる（取り消しの通知で代えない）。確かめは 1 件もまとめても `confirmArchiveChats`・`confirmDeleteChats`。
- 削除したチャットの書きかけ（`chatDraft`・`chatAttachmentsDraft`）も消す。
- 名前は `useChatRename` ＋ `ChatTitleInput` で変える（ダイアログなし）。上限は `CHAT_TITLE_MAX`。
- 「新しいチャット」の作成先の札は `useNewChatPlace` ＋ `NewChatPlaceBadges`。まとまりからの作成先は `@/features/chatList/ui/buckets.ts` の `newChatPlaceOf`。
- ✕ は `closeChatWithChoice`（既定は `chat:close-action`）。Esc・タブの「閉じる」は聞かずに閉じる。
