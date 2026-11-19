# チャットの実行（src/core/chat）の説明
<!-- 行き先: src/features/chat/ -->

チャット = 保存される会話（`Chat`・表 `chats`）、1 回の実行（Turn）= 送ってから終わるまで、記録 = `ChatEvent`（表 `chat_events`）。プロバイダーは `providers/CLAUDE.md`、記録の読み方と AI の操作ツールの口は `src/core/CLAUDE.md`。

## 全体
<!-- 行き先: src/features/chat/ -->

| ファイル | 中身 |
|---|---|
| `runner.ts`・`runnerQueue.ts` | 受付 `Runner`（API から呼ぶ窓口）と、送信待ちの操作の土台 `RunnerQueue` |
| `runtime.ts` | チャットごとの作業中の状態 `ChatRuntime`（保存しない） |
| `turn.ts` | 1 回の実行 `executeTurn`・プロバイダーに渡すもの `buildTurnParams`・結果の反映 `applyResult` |
| `input.ts`・`attachmentNotes.ts` | チャットの作成と続きの指示の下ごしらえ（名前・添付の見出し・届かなかった報告） |
| `deltaBatch.ts`・`streamingTexts.ts`・`chatLogQuery.ts`・`chatIndexCache.ts` | 書きかけの返答・記録の読み方（`src/core/CLAUDE.md` の「チャットの記録の読み方」） |
| ほか | 下の同じ名前の節 |

- 作業中（`isBusy`）= 実行中（`turn`）か送る準備中（`preparing`）。作業中にできない操作（送る・削除・分岐・巻き戻し・移動・アーカイブ）は `requireIdle` で 409。
- 作業中かを確かめてから動かし始めるまで（`await` の間も）`preparing` で数える（理由は `ChatRuntime` のコメント）。
- 作業中の状態は `ChatRuntime` に集め、モジュールの変数に持たない。チャットを消したら `forget` で捨てる。
- 選択は `resolveChatOptions`（送るときの指定 → その AI のプロジェクトの既定 → アプリの既定）。Claude Code 以外は一覧にないモデル名を実行の前にも外す（`knownModel`）。
- 砂場と編集先の制限は、チャットを作るときにアプリの既定を書く（既存のチャットは変わらず、分岐は元を引き継ぐ）。
- AI へ送る定型文（自分の発言として残る）は `@shared/chat/prompts` に置き、コアと画面で同じものを使う。
- 終えるとき `Runner.shutdown` は止める前に作業中のチャットへ `chats.resume_pending` を付け、待たずに DB を閉じる。抜けた `result`（ターンの境目）は起動のとき `endInterruptedTurns` が足す。

## AI の切り替え（providerSwitch*.ts・providerHandoff*.ts）
<!-- 行き先: src/features/providerSwitch/ -->

- `prepareAndCommitProviderSwitch` が会話と Git の状態を準備してまとめて書く。準備中に作業・会話・送信待ちが変わったら保存せず、作った長文ファイルを片付ける。
- 替え直してよいかは `db/chatProviderHandoffs.ts` の `handoffBlocksSwitch` 1 つ（確認の中身・`Runner.switchProvider`・`Store.commitProviderSwitch` が使う）。確定は確認のハッシュが同じときだけ。
- 引き継ぎは動かす直前に `sending` と書く。送ったあとの失敗・中断・起動時の `sending` は受信不明にし、利用者が確かめるまで送り直さない（`confirmResendProviderHandoff`）。
- セッションの消失は確かめ済みの厳密なエラーだけで認める。区切り `provider_switched` をまたぐ巻き戻し・分岐・ファイルを戻すはコアで断る。

## 送る・伝える
<!-- 行き先: src/features/chat/ -->

- `start` はチャットを作ってすぐ動かし、`send` は作業中なら 409。名前は 1 行目で付けて AI にも付けてもらう（その間に変わっていれば置き換えない）。
- `tell` は作業中ならいまのやり取りに足す（口ができるまで `TELLABLE_WAIT_MS` 待つ）。結果は `told` / `queued` / `sent` / `held`。
- 足せなければ送信待ちに戻さず預かり、作業の終わりに `deliverHeld` が送信待ちより先に送る（理由は `runner.ts` のコメント）。以後の「いま」も `tellsClosed` で預かる。
- 「いま」を預かるかは `ChatRuntime.holdsTells` 1 つで決める。預かる場面を足したらここに足す。
- 発言の印（`MessageMarks`）はどの道でも `@shared/chat/handoff` の `marksOf` で通す。自分の発言 `user` には `message_uuid`（ファイルを戻す目印）を残す。
- 自分で送ったら再開の段取りをやめる（`forgetRecovery`）。質問として送る（`pause_after`）は `pauseAfterTurn` か `setStopAfter` の印にする。

## 1 回の実行（turn.ts）
<!-- 行き先: src/features/chat/ -->

- 作業場所は `workdirOf`（null なら本体）。送るたびと作業の終わり（結果を書く前。失敗でも）に、いまのブランチを `chats.branch` に覚える。
- 動かし始める前に止められたら、プロバイダーを動かさずに中断で終える（`turn.ts` のコメント）。
- `chat_delta`・`chat_subagent`・`chat_command_output` は配るだけで保存しない。失敗は投げずに、チャットの失敗（未読）と `error` の記録にする。
- 分岐の起点（`result` の `session_id` / `message_id`）は最後まで終わったときだけ残す。
- 終わったら（失敗・中断も）送信待ちの次を送る。アプリの終了・通信の切断・使用枠の上限で止まったときは送らない。
- 砂場の診断（`sandboxDiagnostics.ts`）は実行ごとに作り、終わり・失敗・中断で必ず `close` する。

## 作業中の様子（ChatLive）
<!-- 行き先: src/features/chat/ -->

- 画面に配る形は `@shared/types` の `ChatLive`。詳細の `live` と SSE の `chat_live` を同じ形にし、変わるたびに丸ごと配る。保存しない。
- 停止（`cancel`）の `stopping` は、プロセスがサブエージェントごと終わるまで立てておく。

## 圧縮と、圧縮前・圧縮後の指示（preCompact.ts）
<!-- 行き先: src/features/compact/ -->

- 圧縮の終わりは null・`compact_boundary`・作業の終わりだけで見る（`requesting` では外さない）。始めた時刻ときっかけは終わるまで変えない。
- 手で圧縮する実行は発言・結果を残さず、回数・未読に数えず、作業中の操作を渡さない（`turn.ts` のコメント）。作業中なら予約（`ChatQueue.reserve("compact")`）。
- 圧縮前指示（共通 → プロジェクトの順）は先に 1 回の作業として送り、最後まで終わったら送信待ち・預かりより先に `/compact`（`compactNow`）。止めた・失敗したら圧縮しない。
- 上限に近づいた自動の圧縮では、プロバイダーの PreCompact フックが足す（`ProviderTurnParams.preCompact`）。`preCompactSent` を立て、圧縮か消去まで足さない。
- 圧縮前指示から圧縮のあとのやり取りが終わるまで（`awaitingCompact`・`compactedTurn`）、「いま」は預かる。
- 圧縮後指示は送信待ちに入れない。`compact` の記録を先に書いてから預かりの先頭に入れる。
- 配る順は 圧縮後指示 → 預かった「いま」→ 送信待ち（`Runner.drainAfterCompact`。`deliverAfterCompact` と `deliverHeld` が共通に使う）。圧縮したやり取りの途中は、圧縮後指示でない指示の所で止める。
- 通信の切断・使用枠の上限・アプリの終了で終わったら、圧縮後指示だけ預かりに残し（`parkAfterCompact`）、ほかは送信待ちの先頭へ。

## 送信待ち（queue.ts・runnerQueue.ts）
<!-- 行き先: src/features/chat/ -->

- 列は `ChatQueue`。変わるたびに `chat_queues` に丸ごと書き、起動したら読み戻す（止めているか・一時停止の印も）。
- 起動したときの再開の確かめ（`restartResume.ts`）を待つ間（`ChatRuntime.resume`）は送らない。
- `sendNextQueued` は作業中なら取り出さない（取り出すと送れずに消える）。
- 一時停止の印（`stops`）は列の位置で持ち、送った・消した・まとめた分だけ寄せる（`remapStops`）。並べ替えは `@shared/chat/queueStops` の `moveToSlot`（画面と同じ）。
- 指示の代わりに挟む行（圧縮・消去）は `queueActionOf` で見分ける。チャット欄の `/clear` は送らずに消去にする（`isClearCommand` の JSDoc）。
- 書き直し中の先頭は送らずに待ち、知らせが `EDIT_HOLD_TTL_MS` 途絶えたら外す（圧縮の預かりも同じ `QueueEdits`）。
- 応答はどれも変えたあとの `QueueState`。列にない指示は 404、送るものがないなどは 409。

## 止まったあとの再開（recovery/）
<!-- 行き先: src/features/chat/ -->

- 通信の切断と使用枠の上限は 1 つの仕組み `ChatRecovery`。理由ごとの違い（待つ条件・文）は `rules.ts` の規則だけに書く。
- 止まったら送信待ちを止め、再開の作業が最後まで終わったら戻す。自分で送った・消したら待つのも聞くのもやめる。待っている状態は保存しない。
- 枠が戻る時刻は、待つ時間でなく時計の時刻で見る（`poller.ts`）。

## 未読・承認と質問（approvals.ts）
<!-- 行き先: src/features/chat/ -->

- 未読の条件は `@shared/chat/state` の `isUnreadEvent`（`db/events.ts` の `latestUnreadId` が同じものを SQL で持つ。変えたら両方）。
- 既読（`POST …/seen`）は、画面が見た `event_id` より新しい結果があれば消さない。
- 回答待ちは `ApprovalCenter` が持ち、回答まで実行は待つ。止められたら拒否で返す（あとの回答は 409）。回答の添付のパスは `answersWithAttachments` が書き添える。

## 巻き戻し・ファイルを戻す（rewind.ts・sessionSwitch.ts）
<!-- 行き先: src/features/chat/ -->

- 巻き戻しは、自分の発言より前のいちばん近い起点（`resumePointBefore`。消去・作業場所を移した区切りで止まる）から分岐し、後ろの記録と送信待ちを消して送り直す。
- `restore_files` はファイルを分岐より先に戻す（`rewindChat` の JSDoc）。`rewindFiles` は dryRun で測ってから戻し、消去のあとなら前のセッション（`sessionAt`）で戻す。
- 長いチャットの乗り換え（`switchAfterCompact`）は直近の区切りだけの新しいセッションに移り、`store.events.remapSession` で付け替える。失敗しても作業は止めない。

## 子チャット（children.ts）
<!-- 行き先: src/features/childChats/ -->

- 子チャットは `parent_chat_id`・`parent_event_id` を持つふつうのチャット。作るのは `startChildChat`。親が作業中でも作れる。
- 引き継ぐときは、親の最後まで終わった作業からプロバイダーの `fork` で写す。写すのは作ってから（`inheritThenExecute`）で、その間は `inheriting` で作業中に数え「いま」は預かる。
- 写せない・起点がない・親と違う AI なら、お知らせを残して引き継がずに動かす。写すのは直近の区切りだけ（子チャットは `CHILD_FORK_KEEP`）。
- 親子の文脈は送るたびに `chatContextNote` で指示に添える（システムプロンプトにしない理由は JSDoc）。
- 移動・削除・アーカイブは子孫ごと（どれかが作業中なら 409）。アーカイブは `store.chats.archive` だけで変え、戻すのは `archived_with_parent` の印のあるものだけ。
- 分岐（`fork.ts`）は最後まで終わった作業からだけで、ファイルは戻さない。親から外す（`detach.ts`）は親なしか先祖の子にだけ上げる。
- サブエージェントについて聞く（`subagentChild.ts`）は記録を添付にし、会話は引き継がない（理由は JSDoc）。
- 親に渡す（`handoff.ts`）はその作業の最後の返答（`lastReplyOfTurn`）だけ。親の発言に `handoff_from`、子に `handoff` を残す。

## AI の操作ツールの中身（ai*.ts）
<!-- 行き先: src/features/chat/ -->

| ファイル | ツール（`kickoff_chat`） | 機能 |
|---|---|---|
| `aiChatEdit.ts`・`aiChatRead.ts`・`aiChatRemove.ts`・`aiOpen.ts` | 家系・読む・アーカイブと削除・開くと下書き | chat |
| `aiCreateChat.ts` | `create_chat` | childChats |
| `aiNotify.ts` / `aiWorktree.ts` / `aiWorkplace.ts` | `notify_user` / `finish_worktree` / `move_workplace` | notifications / worktrees / workplaceMove |
| `aiProject.ts` / `aiTerminal.ts` / `aiVisual.ts` / `aiUserView.ts` | `add_snippet`・`move_memo` / ターミナル / 図 / `get_user_view` | snippets・notes / terminal / visuals / userView |

- 中身は `create…Tools(deps, chatId)` で作り、`buildTurnParams` が実行ごとに渡す。1 回の作業の上限（`AI_CHATS_PER_TURN` など）はその中で数える。
- 相手（家系・プロジェクト・タブ）と設定・世代・深さは呼ぶたびに引き直す。ほかのプロジェクトは断る。
- 承認を聞くのは `create_chat`（設定が `ask`）と、持っていく変更のある `move_workplace` だけ（ほかは戻せる・読むだけ。理由は各ファイルの頭）。
- 自分を含む操作（自分のワークツリー・アーカイブ・作業場所）は予約して作業の終わりに行い、先に送信待ちを止める。予約はメモリだけ。
- 先にすべて確かめてから変える。作業中の相手は断り、待たない。画面に頼むもの（`open_view`・`chat_draft`）は開けたかを待たない。
- 結果の `createdChatMark` は画面が読む。読ませる会話・ターミナルの出力は資料と添え、鍵らしい値は `redactSecrets` で伏せる。

## 作業場所を移す（workplaceMove.ts）
<!-- 行き先: src/features/workplaceMove/ -->

- 作業場所（本体 / ワークツリー・プロジェクト・作業フォルダ）が変わる道はすべて `Runner.moveWorkplace` → `moveChatWorkplace` を通す。道を足すときも通す。
- 手順の順は `workplaceMove.ts` の頭。写せないとき、利用者・AI なら移さずに 400、自動の道・写す口がない・会話がないなら写さずに移す。
- 区切りより前の巻き戻し・分岐・ファイルを戻すは断り（`@shared/chat/workplaceMoves`）、起点は区切りで止まる。画像はそのときの作業場所から解く。
- AI への知らせは区切りのあと最初の実行の文脈に添え、知らせたかは保存せず `store.events.pendingWorkplaceMove` で決める。
- 利用者が移す（`workplaceUserMove.ts`）は子チャットを移さず、持っていく変更は `git/carry.ts`、移せなければ `undo` で戻す。
- AI が移す（`workplaceReservation.ts`）は予約だけで、最後まで終わった作業の終わりに移す（続きは `placeContinuation`）。取り消しは AI にも伝える（`pendingNote`）。

## サブエージェントの報告の受け渡し（reportHandover.ts）
<!-- 行き先: src/features/subagents/ -->

- 数え方は `@shared/chat/subagents`（画面・スマホと同じ）。届かなかった報告は次の指示に添え（`withUndeliveredReports`）、発言の `handover` に残す。

## AI への指示と許可（policy.ts）
<!-- 行き先: src/features/guard/ -->

- `CHAT_POLICY` はどのチャットも同じで、プロバイダーが自分の権限設定に変える。ファイルの編集を自動で承認するかは権限モードだけで決まる。
- `buildSystemPrompt` はどの AI にも同じものを渡す。送るたびに設定を読む。会話ごと別のフォルダへ移るツールは `KICKOFF_DISALLOWED_TOOLS` で外す。

## 書き込みの守り（guard/・sandbox/）
<!-- 行き先: src/features/guard/ -->

| ファイル | 守るもの | 当て方 |
|---|---|---|
| `scope.ts` | 参照資料・`untrackedOnly` のチャットの Git の中身 | 断る |
| `writeScope.ts` | ファイルのツールの書く先（ほかの作業場所は断る） | 聞く |
| `hiddenDb.ts` | 見せない DB への直接の接続 | 断る |
| `dockerCommand.ts`・`dockerGuard.ts` | ほかの作業場所・プロジェクトのコンテナとボリューム | 聞く |
| `deleteGuard.ts`・`gitHookGuard.ts`・`compileCacheGuard.ts` | 消すコマンド・フックを飛ばす・`NODE_COMPILE_CACHE` | 断る |
| `selfProtection.ts` | 自分を動かしている Kickoff | 断る |
| `sandbox/` | Bash が書ける場所 | OS が止める |

- 判定はプロバイダーに依らない純粋関数。Claude は PreToolUse のフック（`turnHooks`）で毎回呼び、権限モード・許可ルールに関係なく効く。
- フックのない CLI は `judgeTool.ts` の `judgeCommand` / `judgeWritePath` / `judgeReadPath` で当てる。守りを足したら両方に入れる。
- 守りの理由と見抜けない書き方は各ファイルの頭に書く（うっかりを防ぐもので、わざと避ける書き方までは見抜けない）。
- Bash の文の区切りは `shellWords.ts` 1 つを共有する。直したら、それを使う守りのテストを全部通す。
- 聞く守りは Auto mode でも聞く。「このチャットでは許可」は `ChatRuntime.writeAllowed` に覚える（保存しない）。
- 砂場（`bashSandboxFor`）はどのチャットにもかけ、内蔵ターミナルにはかけない。利用者の設定ファイルは書ける場所に入れない（理由は JSDoc）。
- 砂場の外で流すコマンドは、コマンド全体がそれだけのときだけ外で流れる（VAR=値・パイプ・リダイレクトが付くと中に戻る）。
- ネットワークは絞らず `networkRelay.ts` の中継を使わせる（`startCore` が起こし `close` で止める）。
- `writeScope` は参照資料・Kickoff の保存先・見せない DB に口を出さず、そちらの守りに任せる（カードを出さない）。
- `deleteGuard` は `ExecutionDeps.trashCommand` があるときだけ付け、`trashCommandEnv` で PATH に kickoff-trash を入れる。

## 添付（uploads.ts）
<!-- 行き先: src/features/attachments/ -->

- 添付は `UploadStore`（保存先の `uploads/<id>/`）。AI には中身でなくパスを添えて Read で読ませる。
- 「AI に渡す」の文は保存するときに鍵らしい値を伏せて切る。見出しは画面から届いた形でなく、保存した `.attachment.json` から書く。
- どこからも使われない添付（`store.events.uploadInUse`）は 30 日で片付ける（`uploadCleanup.ts`）。添付を指す所を足したら `uploadInUse` も直す。
- 表示（`GET /api/uploads/:id`）は画像と PDF だけ inline。`toolImage.ts` は決めたフォルダの中だけ読む（理由はどちらもコードのコメント）。

## ほかのチャットの記録・移動・削除・自動のアーカイブ
<!-- 行き先: src/features/chat/ -->

- ほかのチャットの記録（`transcript.ts`）は、自分の発言・メインエージェントの返答・変えたファイル・失敗・中断だけ。
- 別のプロジェクトへの移動は子孫ごと `Runner.moveWorkplace`（理由 `project_moved`）。
- 削除はゴミ箱へ（`src/core/CLAUDE.md` の「ゴミ箱」）。本当に消すとき、ほかのチャット・ほかの Kickoff が使っていない会話記録だけを消す（`sessionCleanup.ts`）。
- 自動のアーカイブ（`autoArchive.ts`）は親のないチャットだけを見て、子孫も完了したまま日数がたてば子孫ごとしまう（未読・固定は除く）。
