# チャットの実行（src/core/chat）の説明

チャット = 保存される会話（`Chat`・表 `chats`）、1 回の実行（Turn）= 送ってから終わるまで、記録 = `ChatEvent`（表 `chat_events`）。

## 全体

- 受付（API から呼ぶ窓口）は `runner.ts` の `Runner`（送信待ちの操作は土台のクラス `runnerQueue.ts` の `RunnerQueue`）。送った指示はすぐ動かす（同時に動かす数は決めない）。続きは同じセッション（`session_id`）を再開する。
- チャットごとの作業中の状態（実行の止め方 `turn`・送る準備中 `preparing`・作業中の操作 `control`・送信待ち `queue`・書き直し中の指示 `edits`・再開の段取り `recovery`・画面に配る様子）は `runtime.ts` の `ChatRuntime` に集める（入れ物は `ChatRuntimes`。保存しない）。
- 1 回の実行は `turn.ts` の `executeTurn`、チャットの作成と続きの指示の下ごしらえ（添付のパス・添付したメモのパス・届かなかった報告を添える）は `input.ts` の `createChat` / `followupPrompt`。
- 作業中（`isBusy`）= 動かしている（`turn`）か、送る準備中（`preparing`）。作業中にできない操作（送る・削除・分岐・巻き戻し・移動・アーカイブ）は `requireIdle` で 409（圧縮は作業中なら予約になる）。チャットを消したら `forget` で作業中の状態と再開の段取りを捨てる。

## 送る・伝える

- `start`: チャットを作って最初の発言を記録し、すぐ動かす。選択は `resolveChatOptions`（送るときの指定 → プロジェクトの `chat_defaults` → 設定の `chat_defaults`）で決めてチャットに保存する。名前は 1 行目で始め、AI に付けてもらう（`provider.title`。その間に利用者が変えていれば置き換えない）。
- `send`（`POST /api/chats/:id/messages`）: 作業中なら 409。作業中かを確かめてから動かし始めるまで（指示を組み立てる `await` の間も）`preparing` で作業中として数える（その間に送信待ちの自動送信と「いま」が重なると、同じチャットを 2 つ同時に動かし、片方の指示が会話から消えるため）。送るときの選択はチャットに反映する。
- `tell`（`POST /api/chats/:id/tell`）: 止めずに伝える。作業中なら `TurnControl.tell` でいまのやり取りに発言を足す（メインのエージェントが手順の切れ目で読む。裏のサブエージェント・コマンドは動き続ける）。足し先は指示を組み立てたあとに取り直し、足せないとき（始まる前・圧縮中など）は送信待ちに入れる（入れたときにもう作業が終わっていれば、その場で送る）。作業中でなければ `send`。結果は `told` / `queued` / `sent`。選択は次に送るときから効く。
- 自分の発言の記録（`user`）には `message_uuid`（Claude Code にも同じ ID で渡し、ファイルを戻す目印）を残す。自分で送ったら、再開の段取りをやめる（`forgetRecovery`）。

## 1 回の実行（turn.ts）

- 作業場所は `workdirOf`（`worktree_path`、null なら本体。フォルダが消えていれば分かる文で失敗にする）。送るたびに、いまのブランチを `chats.branch` に覚える（ワークツリーを片付けても消さない）。動かし始める前に止められたら、プロバイダーを動かさずに中断で終える（中断済みの signal には abort の知らせが来ないため）。
- プロバイダーには、システムプロンプト（`buildSystemPrompt`）・許可（`CHAT_POLICY`）・選択・続きのセッション・読めるフォルダ（添付の保存先と参照資料）・作業場所の外の参照資料（`readOnlyPaths`。読むだけ）を渡す。知らせは、記録を `store.events.add`（`init` のセッション ID はチャットに書く）、作業中の様子を `ChatRuntime.update`、返答の途中経過 `chat_delta`・サブエージェントの途中経過 `chat_subagent`・実行中のコマンドの出力 `chat_command_output` は配るだけ（保存しない）。
- 結果の反映（`applyResult`）: 状態・費用・回数・コンテキストの大きさ・未読を書き、作業の終わりの記録 `result` を残す（`network`・`usage_limit`、最後まで終わったときだけ分岐の起点の `session_id` / `message_id`）。この実行で始めたサブエージェントが終わっていなければ、作業の終わりとともに止まったことをお知らせに残す（`unfinishedSubagents`。Claude Code のプロセスが終わるため。通信の切断のときは再開の段取りが知らせる）。
- 失敗は投げずに、チャットの失敗（未読）と `error` の記録にする。終わったら再試行・裏の作業・圧縮中の表示と作業中の操作を外す。
- 終わったら（完了でも、止めた・失敗したときも）`Runner` が送信待ちの次を送り（圧縮を予約していれば、先に圧縮する）、使用枠を取り直す。アプリを終えるとき、通信の切断・使用枠の上限で止まったときは送らない（送っても失敗して消えるため）。

## 作業中の様子（ChatLive）

- 画面に配る作業中の様子は `@shared/types` の `ChatLive`（送信待ち `queue`・裏の作業 `background`・通信の再試行 `retry`・つながるのを待っている `reconnect`・圧縮中の様子 `compacting`（始めた時刻ときっかけ）・停止中 `stopping`・圧縮の予約 `compact_next`）。チャットの詳細（`GET /api/chats/:id`）の `live` と SSE の `chat_live` で同じ形にし、どれかが変わるたびに丸ごと配る。保存しない。
- 再試行（Claude Code の `api_retry`）は返答が届き始めたら消す。裏の作業は Claude Code の `background_tasks_changed`（いま動いているものの一覧）と、メインの返答が終わったか（`replied`）。1 件ずつ止めるのは `POST /api/chats/:id/background/:taskId/stop`（`TurnControl.stopTask`。作業中でなければ 409）。
- 圧縮: Claude Code の `status`（`compacting` → null）を `ProviderCallbacks.compacting` で受け（終わりは null・`compact_boundary`・作業の終わりだけで見る。API に問い合わせるたびの `requesting` は圧縮の途中にも挟まりうるので、それでは外さない）、始めた時刻ときっかけ（`CompactingState`）を終わるまで変えずに持つ（Claude Code は待っている間も 30 秒ごとに知らせ直す）。きっかけは、手で圧縮した実行（圧縮のボタン・`/compact` で始まる指示）なら `manual`、ほかの指示の途中で起きたものは上限に近づいた自動の `auto`（`compactTriggerOf`。画面は自動のとき、なぜ作業が止まって見えるかを添える）。失敗（`compactFailed`）は、手で圧縮したときだけ理由をお知らせに残す（自動の圧縮の失敗は、会話が短くて要約するものがない `too_few_groups` なども含み、Claude Code も知らせない）。要約したら記録に `compact`（前後のトークン数と、Claude Code が知らせたときはかかった時間 `duration_ms`）が残る。手で圧縮する（`POST /api/chats/:id/compact` → `/compact` を送る）ときは、発言・結果を残さず、回数に数えず、未読にもしない（まだ会話がなければ 409）。作業中に頼むと予約にする（`ChatRuntime` の `compactNext` → `ChatLive.compact_next`）: いまのやり取りが終わったら（通信の切断・使用枠の上限で止まったときは除く）、送信待ちより先にすぐ圧縮を始め（`startReservedCompact`。始めたら予約は外れる）、圧縮が終わったらその終わりで送信待ちの次を送る。予約をやめるのは `DELETE /api/chats/:id/compact`（予約していなければ何もしない）。テストは `runner.queue.test.ts`・`server.turns.test.ts`。
- 停止: `cancel`（`POST /api/chats/:id/cancel`）は `stopping` を立てて実行を止める。Claude Code のプロセスがサブエージェント・裏のコマンドごと終わるまで（ふつうは 2 秒ほど、応じなければ SDK が 5 秒後に強制終了する）立てたままにし、終わったら消す。

## 送信待ち（queue.ts・runnerQueue.ts）

- 作業中に送った次の指示の列は `ChatQueue`（`ChatRuntime.queue`）。変わるたびに `chat_queues` に丸ごと書き（`store.queues.save`）、起動したら読み戻す。前回の作業はアプリの終了で中断しているので、指示のある列は止めておく。
- `POST /api/chats/:id/queue` は、作業中なら列に入れ、作業中でなければすぐ送る（`hold` なら列の最後に足すだけ）。作業が終わったら `sendNextQueued` が先頭を送る（作業中なら取り出さない。取り出すと送れずに消える）。送れなければ理由をチャットに残す。
- 止めておく（`PUT …/queue/paused`）と、終わっても送らない。「すぐ送る」（`sendQueuedNow`）は 1 件を送り、作業中なら止めずに伝え、伝えられなければ列の先頭に戻す。自動に戻すと、作業中でなければ先頭をすぐ送る。列が空になったら自動に戻る。
- `send-all` は 1 つにまとめていま送る（作業中なら伝える）。`send-in-order` は止めておくのをやめ、印も外して、終わるたびに 1 件ずつ最後まで送る。`merge` は送らずに 1 件にまとめる（列の順に空行でつなぎ、選んだうちのいちばん上に残す）。列にない指示は 404、送るものがないなどは 409。応答はどれも変えたあとの `QueueState`。
- 一時停止の印（`stops`。0 = 1 件目の上、n = n 件目のあと）は指示に付けず、列の中の位置で持つ。前の指示を送った・消した・まとめた分だけ上に寄る（`remapStops`）。自動で送る次の指示の上に印があれば、送らずに止めておき（`takeNext`。印は残る）、自動に戻すとその印を越えて次の印まで送る。すべて送ったあとの印は、次に来た指示の前で止める（消して空にしたら外れる。列が空でも印があれば `chat_queues` の行を残す。読み戻した空の列は止めておくにはしない）。
- 並べ替えでは、印の線を見た目の並びの 1 行として扱い、動かした指示だけが線を越える（`@shared/chat/queueStops` の `moveToSlot`。いちばん上・下へ移しても端の線は端に残り、1 つ上・下へ移すときに隣が線なら、並びを変えずに線だけを越える。`move-many` は `before` と `below_stop` で落とした位置を決める）。
- 書き直し中の保留: 画面は書き直す欄を開いている指示を `PUT …/queue/editing` で丸ごと知らせ、開いている間は持ち時間（`@shared/chat/queueEditHolds` の `EDIT_HOLD_TTL_MS`、20 秒）より短い間隔で知らせ直す。コアは `queueEdits.ts` の `QueueEdits` で覚え、自動で送る先頭を書き直していれば送らずに待つ（`QueueState.waiting_edit`）。知らせが途絶えたら（画面を閉じた・落ちた）持ち時間で外れて送り、止まったままにしない。

## 止まったあとの再開（recovery/）

- 通信の切断（`ProviderTurnResult.network`）と使用枠の上限（`usageLimit`）で止まったときの段取りは 1 つの仕組み（`recovery.ts` の `ChatRecovery`）で、理由ごとの違い（待つ条件・文）だけを `rules.ts` の `reconnectRule` / `usageLimitRule` に分ける。チャットごとの状態は `ChatRuntime.recovery`（`state.ts` の `RecoveryState`）に 1 つで持つので、続けて別の理由で止まっても、止めた送信待ちを引き継ぐ。
- 流れ: 止まったら送信待ちを止める（`held`。自分で止めていたものはそのまま）→ 条件を待つ・再開するかを聞く（承認と同じ回答待ち。`ApprovalKind` の `reconnect` / `usage_limit`）→ 再開の指示を送り、その作業が最後まで終わったら止めた送信待ちを戻す。自分で送った・チャットを消したら、待つのも聞くのもやめる（送信待ちは止めたまま）。待っている状態は保存しないので、再起動したら聞かない。
- 通信の切断: つながったら（`reachability.ts` の `canReachApi`。15 秒ごと）`resumePrompt` を送って自動で再開する。その実行で通信で止まったサブエージェント（`networkStoppedSubagents`）は、名前と ID を添えて SendMessage で続きから再開するよう頼む（最後まで終わるまで覚え、ほかの理由で終わったら頼まない）。続けて `MAX_AUTO_RESUMES`（3）回止まったら、再開するかを聞く。送信待ちを自分で止めていた・設定の `auto_resume_on_reconnect` が切れているときは、お知らせだけ。待っている間は `ChatLive.reconnect`、やめるのは `DELETE /api/chats/:id/reconnect`（待っていなければ 409）。
- 使用枠の上限: 枠が戻る時刻は Claude Code が知らせたもの、なければ使い切った枠の戻る時刻（`exhaustedResetOf`）。分からなければお知らせだけ。戻る時刻（＋1 分）を過ぎたら、勝手に再開せず続けるかを聞き、続けるなら `USAGE_RESUME_PROMPT` を送る。時刻は待つ時間ではなく時計で 1 分ごとに見る（Mac のスリープで遅れないため。`poller.ts` の `Poller`）。

## 未読

- 未読（`chats.unread`）は、最新の結果をまだ一番下まで見ていないこと。付けるのは AI の文章の返答（サブエージェントのものは除く）・作業の終わり・失敗（`@shared/chat/state` の `isUnreadEvent`）で、作業中でも返答が届けば付ける（`turn.ts` の `emit`）。中断の終わり・圧縮では付けない。
- 消すのは `POST /api/chats/:id/seen`。`event_id`（画面で一番下まで見た記録）より新しい結果（`store.events.latestUnreadId`）があれば消さない。`event_id` がなければそのまま消す（メニューの「既読にする」）。

## 承認と質問

- `approvals.ts` の `ApprovalCenter` が回答待ち（ツールの承認・AI からの質問・再開するかの確かめ）を持ち、回答まで実行は待つ。実行が止められたら拒否として返す（あとからの回答は 409）。SSE の `approval` / `approval_resolved`、一覧は `GET /api/approvals`。
- 記録には依頼（`approval`）と回答（`approval_resolved`。`kind` 付き）を残す。AI からの質問への回答（`action: "answer"`）は、選んだままの回答（`ApprovalDecision.plain`）と「その他」の添付も残す。AI には、`POST /api/approvals/:id` で `uploads.ts` の `answersWithAttachments` が添付のパスを回答の文に書き添えてから渡す（AskUserQuestion の回答は文字だけなので、AI が Read で読む）。

## 分岐・巻き戻し・ファイルを戻す

- 分岐（`fork.ts` の `forkChat`、`POST /api/chats/:id/fork`）: 作業の終わり（`result` の `session_id` / `message_id`）から会話を新しいセッションに写し、そこまでの記録を写した新しいチャットを作る。起点は最後まで終わった作業だけ（止めた・失敗した作業の最後のメッセージはセッションに残らないことがある）。ファイルは戻さない。
- 巻き戻し（`rewind.ts` の `rewindChat`、`POST /api/chats/:id/rewind`）: 自分の発言より前の、いちばん近い起点から分岐し（なければ最初から）、その発言から後ろの記録と送信待ちを消して、書き直した文で送り直す（添付は元の発言のもの）。`restore_files` ならファイルも戻す（ファイルの記録は元のセッションにしかないので、分岐の前に戻す）。
- ファイルを戻す（`rewindFiles`、`POST /api/chats/:id/rewind-files`）: 実行はいつも編集の前のファイルを取っておき（`enableFileCheckpointing`）、プロバイダーの `rewindFiles` で発言（`message_uuid`）を送る前の状態に戻す。先に dryRun で量を測ってから戻し、お知らせを残す（`dry_run` なら測るだけ）。戻るのは Claude Code の編集のツールで変えたファイルだけ。
- どれも作業中は 409、起点にできない・対応していない・ファイルを戻せないときは 400。

## 子チャット（children.ts）

- 子チャットは `chats` の `parent_chat_id`（親）と `parent_event_id`（聞いた親の発言の記録）を持つふつうのチャット。作るのは `startChildChat`（`POST /api/chats/:id/children`。本文 `ChildChatBody` = 文・選んだ文 `quote`・引き継ぐか `inherit`（既定 true）・`event_id`・選択。201 で子を返す）。親が作業中でも作れる（親は止めない）。
- 引き継ぐときは、親の最後まで終わった作業（`result` の `session_id` / `message_id`）からプロバイダーの `fork` で会話を写し、子はそのセッションの続きとして送る。起点がなければ、お知らせ（「引き継げる会話がまだない」）を残して、選んだ文だけで始める。指示は選んだ文を引用（`> `）にして、その下に文。作業場所は親と同じ、名前は文から付ける（`createChat` の `titleText`。画面は選んだ文を引用にして文の頭に入れて送るので、頭の引用の行は名前に使わない `titleSourceOf`）。
- アーカイブ・アーカイブを戻す・別のプロジェクトへの移動・削除は、子孫ごと（`store.chats.descendants`。深い順。どれかが作業中なら 409）。削除の知らせは子孫の分も出す（DB は `ON DELETE CASCADE` でも消える）。
- テストは `http/server.children.test.ts`。

## サブエージェントの報告の受け渡し

- 数え方は、画面の一覧と共有の `@shared/chat/subagents`（`src/shared/CLAUDE.md`）を使う。
- 届かなかった報告（裏で動かしたサブエージェントが報告したのに、親が動かないまま作業が終わったもの）は、次に送る指示（`send` / `tell`）に本文を自動で添えて渡す（`reportHandover.ts` の `undeliveredReports` / `withUndeliveredReports`。利用者の文が先で、関係がなければ読み流してよいと添える。長ければ頭だけ）。自分の発言の記録の `handover` に行のキーを残し、一覧では受け取った = 完了にする。待たずに渡すときは、画面が `HAND_OVER_NOW` を伝える（本文はコアが添える）。

## AI への指示と許可（policy.ts）

- `CHAT_POLICY`: 承認なしで使えるコマンド（Git の読み取り・テスト・型チェック・ビルド）と Web。どのチャットも同じで、プロバイダーが自分の権限設定に変える。ファイルの編集を自動で承認するかは、権限モードだけで決まる。
- `buildSystemPrompt(project, workdir)`: Claude Code の既定のシステムプロンプトに足す文脈（プロジェクト・作業場所（ワークツリーなら本体は変えないよう添える）・概要・作業の進め方・参照資料）。「作業の進め方」には、中断すると裏のサブエージェント・コマンドも止まること、終わらないコマンドを裏で動かしたまま返答を終えないこと、サブエージェントが通信のエラー・出力の上限で止まったら 1 回だけ SendMessage で続きを頼むこと（ほかの失敗・利用者が止めたものは伝えるだけ）を書く。
- AI へ送る定型文（自分の発言として残る。再開・再試行・サブエージェントへの指示）は `@shared/chat/prompts` に集め、コアと画面で同じものを使う。

## 書き込みの守り（guard/）

- 判定はプロバイダーに依らない純粋関数で、Claude は PreToolUse のフック（`turnHooks`）で毎回呼ぶ（権限モード・許可ルールに関係なく効く）。
- `scope.ts` の `evaluateReferenceWrite`: 作業場所の外の参照資料への書き込み（Write / Edit / MultiEdit / NotebookEdit）を断る（リンクを解決して比べる）。
- `selfProtection.ts` の `evaluateSelfProtection`: エージェントを動かしている Kickoff 自身（`currentSelf`: プロセス・保存先・API のポート・アプリ本体）を壊す呼び出し（保存先やアプリ本体に触る・自分の API を叩く・自分を kill・名前での pkill / killall・AppleScript）を断る。保存先の `uploads/`（添付）を Read で読むのは通す。開発版は別の名前・保存先・ポートなので断らない。うっかりを防ぐもので、わざと避ける書き方までは見抜けない。

## 添付・ほかのチャットの記録・移動・自動のアーカイブ

- 添付は `uploads.ts` の `UploadStore`（保存先の `uploads/<id>/<ファイル名>`、1 つ 30MB まで）。パスを指示に書き添えて（`withAttachmentNote`）AI に Read で読ませる。画面での表示（`GET /api/uploads/:id`）は画像と PDF だけ inline、ほかはダウンロードさせる（画面の権限でスクリプトを開かせない）。
- ほかのチャットを参照: `POST /api/chats/:id/transcript` がそのチャットのやり取りを Markdown（`チャット履歴-<名前>.md`）にし、添付として保存して返す（`transcript.ts` の `chatTranscript` / `transcriptFileName`。自分の発言（質問への回答も）・メインの AI の返答と、作業ごとに変えたファイル・失敗・中断だけ。ツールの出力・サブエージェントの発言は入れない）。
- 別のプロジェクトへの移動（`POST /api/chats/:id/move`、`store.chats.move`）: グループ・作業場所・ブランチを外し、作業場所は移った先の本体にする。並び順は変えない。作業中は 409。Claude Code の会話は作業フォルダが変わっても続く。
- 自動のアーカイブ（`autoArchive.ts` の `startAutoArchive`）: 設定の `auto_archive_days` があれば、起動したとき・1 時間ごと・設定を変えたときに、完了・中断のまま日数がたったチャット（未読・固定は除く）をしまう（`store.chats.archiveStale`）。
