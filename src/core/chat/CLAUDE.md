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
- `tell`（`POST /api/chats/:id/tell`）: 止めずに伝える。作業中なら `TurnControl.tell` でいまのやり取りに発言を足す（メインエージェントが手順の切れ目で読む。裏のサブエージェント・コマンドは動き続ける）。足し先は指示を組み立てたあとに取り直し、足せないとき（始まる前など）は送信待ちに入れる（入れたときにもう作業が終わっていれば、その場で送る）。作業中でなければ `send`。結果は `told` / `queued` / `sent` / `held`。選択は次に送るときから効く。
- 圧縮中と、圧縮前指示を送ってから圧縮が終わるまで（`ChatRuntime.awaitingCompact` → `ChatLive.awaiting_compact`。圧縮前指示の作業中も）の `tell` は足さずに預かる（`held`。`ChatRuntime.holdsTells`・`afterCompact` → `ChatLive.after_compact`。圧縮前指示の作業に混ざり、画面では圧縮より上に出て、要約したあとの会話に入ったかも分からないため）。預かる間が終わったら（`ChatRuntime` が `holdsTells` が外れたときに `onCompactEnded` → `Runner.deliverAfterCompact`）、いまのやり取りに送った順に伝え直す（圧縮後指示があれば、それを先頭に。下の「圧縮後指示」）（報告の添え書きもそのときに組み立てる）。いまのやり取りに足せない（手で圧縮する実行・作業ごと終わった）ときは、実行の終わりに `deliverHeld` が 1 件目をすぐ送り、残りはその作業に伝える（送信待ちを止めていても、送信待ちより先に。作業していないときの「いま」と同じ）。通信の切断・使用枠の上限・アプリの終了で終わったときは送信待ちの先頭に入れる。手で圧縮する実行（圧縮のボタン）には作業中の操作を渡さない（足すと返答が圧縮の実行に入り、未読・作業の終わりが残らない）ので、その実行の間はずっと預かる。
- 質問として送る（`pause_after`。`POST …/messages`・`/tell`・`/queue` の本文。`SendOpts.pauseAfter`）: その指示の作業が終わったら、送信待ちを自動で送らずに一時停止する。いまの作業に入った（`send` で動かし始める前・`told`・`held`）なら 1 件目の上の印（`RunnerQueue.pauseAfterTurn`。作業のあいだに来た指示の前で止まり、来なければ作業の終わりに外れる）、列に入れた（`queued`・`/queue` で作業中）ならその指示のすぐあとの印（`setStopAfter`）。
- 自分の発言の記録（`user`）には `message_uuid`（Claude Code にも同じ ID で渡し、ファイルを戻す目印）を残す。自分で送ったら、再開の段取りをやめる（`forgetRecovery`）。

## 1 回の実行（turn.ts）

- 作業場所は `workdirOf`（`worktree_path`、null なら本体。フォルダが消えていれば分かる文で失敗にする）。送るたびに、いまのブランチを `chats.branch` に覚える（ワークツリーを片付けても消さない）。動かし始める前に止められたら、プロバイダーを動かさずに中断で終える（中断済みの signal には abort の知らせが来ないため）。
- プロバイダーには、システムプロンプト（`buildSystemPrompt`）・指示に添える文脈（子チャットの親・子チャットのあるチャットの子孫。`chatContextNote`）・許可（`CHAT_POLICY`）・選択・続きのセッション・読めるフォルダ（添付の保存先と参照資料）・作業場所の外の参照資料（`readOnlyPaths`。読むだけ）を渡す。知らせは、記録を `store.events.add`（`init` のセッション ID はチャットに書く）、作業中の様子を `ChatRuntime.update`、返答の途中経過 `chat_delta`・サブエージェントの途中経過 `chat_subagent`・実行中のコマンドの出力 `chat_command_output` は配るだけ（保存しない）。
- 圧縮の直後のコンテキストの大きさ（`ProviderCallbacks.context`）は、作業の終わりを待たずにチャットの `context_tokens` に書く（自動の圧縮は作業の途中で起き、そのあとも作業が続くので、終わりまで入力欄のメーターが圧縮の前の値のままだった）。作業の終わりには最後の応答の大きさで書き直す。
- 結果の反映（`applyResult`）: 状態・費用・回数・コンテキストの大きさ・未読を書き、作業の終わりの記録 `result` を残す（`network`・`usage_limit`、最後まで終わったときだけ分岐の起点の `session_id` / `message_id`）。この実行で始めたサブエージェントが終わっていなければ、作業の終わりとともに止まったことをお知らせに残す（`unfinishedSubagents`。Claude Code のプロセスが終わるため。通信の切断のときは再開の段取りが知らせる）。
- 失敗は投げずに、チャットの失敗（未読）と `error` の記録にする。終わったら再試行・裏の作業・圧縮中の表示と作業中の操作を外す。
- 終わったら（完了でも、止めた・失敗したときも）`Runner` が送信待ちの次を送り（次が会話の圧縮の行なら圧縮し、コンテキストの消去の行なら消してから次を送る。下の「送信待ち」）、使用枠を取り直す。アプリを終えるとき、通信の切断・使用枠の上限で止まったときは送らない（送っても失敗して消えるため）。

## 作業中の様子（ChatLive）

- 画面に配る作業中の様子は `@shared/types` の `ChatLive`（送信待ち `queue`・裏の作業 `background`・通信の再試行 `retry`・つながるのを待っている `reconnect`・圧縮中の様子 `compacting`（始めた時刻ときっかけ）・停止中 `stopping`・圧縮が終わるまで預かった「いま」`after_compact`・圧縮前指示から圧縮が終わるまでか `awaiting_compact`）。チャットの詳細（`GET /api/chats/:id`）の `live` と SSE の `chat_live` で同じ形にし、どれかが変わるたびに丸ごと配る。保存しない。
- 再試行（Claude Code の `api_retry`）は返答が届き始めたら消す。裏の作業は Claude Code の `background_tasks_changed`（いま動いているものの一覧）と、メインの返答が終わったか（`replied`）。1 件ずつ止めるのは `POST /api/chats/:id/background/:taskId/stop`（`TurnControl.stopTask`。作業中でなければ 409）。
- 圧縮: Claude Code の `status`（`compacting` → null）を `ProviderCallbacks.compacting` で受け（終わりは null・`compact_boundary`・作業の終わりだけで見る。API に問い合わせるたびの `requesting` は圧縮の途中にも挟まりうるので、それでは外さない）、始めた時刻ときっかけ（`CompactingState`）を終わるまで変えずに持つ（Claude Code は待っている間も 30 秒ごとに知らせ直す）。きっかけは、手で圧縮した実行（圧縮のボタン・`/compact` で始まる指示）なら `manual`、ほかの指示の途中で起きたものは上限に近づいた自動の `auto`（`compactTriggerOf`。画面は自動のとき、なぜ作業が止まって見えるかを添える）。失敗（`compactFailed`）は、手で圧縮したときだけ理由をお知らせに残す（自動の圧縮の失敗は、会話が短くて要約するものがない `too_few_groups` なども含み、Claude Code も知らせない）。要約したら記録に `compact`（前後のトークン数と、Claude Code が知らせたときはかかった時間 `duration_ms`）が残る。手で圧縮する（`POST /api/chats/:id/compact` → `/compact` を送る）ときは、発言・結果を残さず、回数に数えず、未読にもしない（まだ会話がなければ 409）。作業中に頼むと予約にする（`ChatQueue.reserve("compact")`）: 送信待ちのいちばん上（1 件目の上の線よりも上）に会話の圧縮の行を入れ、いまのやり取りが終わったら（通信の切断・使用枠の上限で止まったときは除く）送信待ちより先にすぐ圧縮し、圧縮が終わったらその終わりで送信待ちの次を送る。もう予約していれば足さない。止めているときは、止めるのを 1 件目の上の線に置き換える（予約した圧縮だけは送り、そのあとで止まる）。予約をやめるのは、その行を送信待ちから消す（`DELETE …/queue/:queueId`）。テストは `runner.queue.test.ts`・`server.turns.test.ts`。
- 圧縮前指示（`preCompact.ts`。設定とプロジェクトの `pre_compact_prompt` のうちオン（`pre_compact_enabled`。オフなら文を残したまま送らない）の分を、共通 → プロジェクトの順につなぐ `preCompactPromptOf`。圧縮で細かい内容が失われる前に、メモを残してもらうなどのため）:
  - 手で圧縮する（`Runner.compact`。ボタン・予約・送信待ちの圧縮の行のどれも）とき、指示があれば先にその指示を 1 回の作業として送り（記録は指示の文だけの `user` に `pre_compact: true`、AI には `manualPreCompactMessage` の前置きを付ける。`TurnRequest.thenCompact`）、その作業が最後まで終わったら送信待ちより先に `/compact` を送る（`compactNow`）。止めた・失敗したら圧縮しない。
  - 預かる間（`awaitingCompact`）: 圧縮前指示を送ったとき（手で圧縮する `compact` が指示を送る前・自動の圧縮の前に足した `preCompactSent`）と、手で圧縮する実行の間に立て、自動の圧縮の `compact` の記録（ふつうの作業の中の圧縮）・手で圧縮する実行の終わり・続けて圧縮しない作業の終わり・コンテキストの消去で外す。圧縮前指示の作業が最後まで終わったのにまだ圧縮していなければ（手で頼んだ = `thenCompact`、自動の圧縮の前の指示で区切りまで圧縮が来なかった = `awaitingCompact`）、送信待ち・預かった指示より先に `/compact` を送る（`compactNow`。自動の圧縮の前のものは、きっかけを `auto` にして記録の `compact` の `trigger` も auto にする = `TurnRequest.compactTrigger`）。次の指示を送ってからその初めに圧縮されると、指示が圧縮より上に出るため。止めた・失敗したら圧縮せず、預かった指示を送る。
  - 上限に近づいた自動の圧縮: 指示があり、チャットのコンテキストウィンドウが分かっていれば（最初の作業ではまだ分からない）、`ProviderTurnParams.preCompact`（`autoPreCompactParams`。前置き `autoPreCompactMessage`・ウィンドウ・始めの大きさ）を渡し、プロバイダーが PreCompact フックで圧縮を待たせて指示を足す（`providers/CLAUDE.md`）。足したら `preCompactSent` で記録（`pre_compact`）を残し、`ChatRuntime.preCompactSent` を立てて、圧縮する（`compact` の記録）かコンテキストを消去するまでは足さない（手で圧縮する前の指示の作業の間も立てる）。区切り（作業の終わり）で圧縮が来るときも、次の作業の初めにフックが呼ばれるので同じ仕組みで足す。
- 圧縮後指示（設定とプロジェクトの `post_compact_prompt` のオン（`post_compact_enabled`）の分を同じくつなぐ `postCompactPromptOf`。要約になった会話から作業に戻る前に、メモを読み直してもらうなどのため）: 手で・自動のどちらの圧縮でも、圧縮前指示を送ったかに関係なく、`compact` の記録を残したとき（`turn.ts`。記録を先に書く）に `postCompactItem`（`QueuedMessage.post_compact`）を預かり（`afterCompact`）の先頭に入れる。預かる間がもう終わっていれば `ChatRuntime.flushAfterCompact` ですぐ配る。
  - 配り方（`Runner.drainAfterCompact`。`deliverAfterCompact` と `deliverHeld` で共通）: `ChatRuntime.deliveringAfterCompact` を立てて配り終えるまで新しい「いま」も預かりの末尾に足し（`holdsTells`）、先頭から 1 件ずつ出す。いまのやり取りに足せるなら `tell`、手で圧縮する実行のあとなどで足せなければ 1 件目（= 圧縮後指示）を新しい作業として `send` し、その作業に操作が付くのを待って（`untilTellable`）残りを伝える。これで、圧縮前指示から圧縮が終わるまでに送った指示は、必ず圧縮後指示のあとに入る。
  - 記録は指示の文だけの `user` に `post_compact: true`、AI には `postCompactMessage` の前置きを付ける（`SendOpts.postCompact`）。通信の切断・使用枠の上限などで作業ごと終わって送信待ちの先頭に回したときも印（`QueuedMessage.post_compact`）を残し、送るときに同じ形にする（`sendNextQueued` / `sendQueuedNow`）。
- 停止: `cancel`（`POST /api/chats/:id/cancel`）は `stopping` を立てて実行を止める。Claude Code のプロセスがサブエージェント・裏のコマンドごと終わるまで（ふつうは 2 秒ほど、応じなければ SDK が 5 秒後に強制終了する）立てたままにし、終わったら消す。

## 送信待ち（queue.ts・runnerQueue.ts）

- 作業中に送った次の指示の列は `ChatQueue`（`ChatRuntime.queue`）。変わるたびに `chat_queues` に丸ごと書き（`store.queues.save`）、起動したら読み戻す。前回の作業はアプリの終了で中断しているので、指示のある列は止めておく。
- `POST /api/chats/:id/queue` は、作業中なら列に入れ、作業中でなければすぐ送る（`hold` なら列の最後に足すだけ）。作業が終わったら `sendNextQueued` が先頭を送る（作業中なら取り出さない。取り出すと送れずに消える）。送れなければ理由をチャットに残す。
- 止めておく（`PUT …/queue/paused`）と、終わっても送らない。「すぐ送る」（`sendQueuedNow`）は 1 件を送り、作業中なら止めずに伝え、伝えられなければ列の先頭に戻す。自動に戻すと、作業中でなければ先頭をすぐ送る。列が空になったら自動に戻る。
- `send-all` は 1 つにまとめていま送る（作業中なら伝える）。`send-in-order` は止めておくのをやめ、印も外して、終わるたびに 1 件ずつ最後まで送る。`merge` は送らずに 1 件にまとめる（列の順に空行でつなぎ、選んだうちのいちばん上に残す）。列にない指示は 404、送るものがないなどは 409。応答はどれも変えたあとの `QueueState`。
- 一時停止の印（`stops`。0 = 1 件目の上、n = n 件目のあと）は指示に付けず、列の中の位置で持つ。前の指示を送った・消した・まとめた分だけ上に寄る（`remapStops`）。自動で送る次の指示の上に印があれば、送らずにその線の所で待つ（`takeNext`。印は残り、止めておく（`paused`）には切り替えない）。待っている線を消した・動かした・指示を線の上へ移したら、そのまま次の印まで送る（`RunnerQueue.releasingStop`。止めておくにしているとき・作業中は送らない）。止めておくを切り替える（`setPaused(false)`）と 1 件目の上の印も外れる。すべて送ったあとの印は、その作業のあいだに次に来た指示の前で止める（列が空でも印があれば `chat_queues` の行を残す）。次の指示が来ないまま作業が終わった・消して空にしたら外れる（残すと、あとで自分ですぐ送った作業の送信待ちの前で思いがけず止まる）。空の列の印は読み戻さない（待っていた作業はアプリの終了で終わっている）。
- 並べ替えでは、印の線を見た目の並びの 1 行として扱い、動かした指示だけが線を越える（`@shared/chat/queueStops` の `moveToSlot`。いちばん上・下へ移しても端の線は端に残り、1 つ上・下へ移すときに隣が線なら、並びを変えずに線だけを越える。`move-many` は `before` と `below_stop` で落とした位置を決める）。
- 会話の圧縮の行（`QueuedMessage.compact`。文・添付は空）: 指示と同じく列に並び、並べ替え・消す・一時停止の印の扱いも同じ。`POST …/queue/compact`（`after` を渡せばその指示のすぐあと（すぐあとに印があれば印の上 = 止まる前に圧縮する）、省けばいちばん下。`RunnerQueue.queueAction` → `ChatQueue.addAction`）で足す。自動で送る次がこの行なら `/compact` を送り（`Runner.compact`。始められなければ理由をチャットに残して次を送る）、「すぐ送る」は作業中ならいちばん上に移して予約にし、作業していなければすぐ圧縮する（まだ会話がなければ 409 で列に残す）。書き直す（400）・まとめる（`merge` は除いて列に残し、まとめる数にも数えない）ことはできない。
- コンテキストの消去の行（`QueuedMessage.clear`。文・添付は空）: 圧縮の行と同じ「指示の代わりに挟む行」（`QueueAction`。見分けは `@shared/chat/queueActions` の `queueActionOf` / `isQueueAction`。足すのは `POST …/queue/clear`、`after` も同じ）。自動で送る次がこの行なら `Runner.clearContext` でセッションを外し（`chats.session_id` と `context_tokens` を null にして、記録に `context_cleared` を残す。実行はしないので、終わったらそのまま次を送る）、次の指示は新しいセッションで始まる。まだ会話がなければ何もせずに次へ。「すぐ送る」は作業中ならいちばん上に移して予約にし（`ChatQueue.reserve("clear")`）、作業していなければすぐ消して、止めていなければ次を送る（まだ会話がなければ 409 で列に残す）。書き直す・まとめるは圧縮の行と同じくできない。
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
- 巻き戻し（`rewind.ts` の `rewindChat`、`POST /api/chats/:id/rewind`）: 自分の発言より前の、いちばん近い起点から分岐し（なければ最初から。間にコンテキストの消去 `context_cleared` があれば、その手前の起点は使わず最初から = `sessionPoints.ts` の `resumePointBefore`）、その発言から後ろの記録と送信待ちを消して、書き直した文で送り直す（添付は元の発言のもの）。`restore_files` ならファイルも戻す（ファイルの記録は元のセッションにしかないので、分岐の前に戻す）。
- ファイルを戻す（`rewindFiles`、`POST /api/chats/:id/rewind-files`）: 実行はいつも編集の前のファイルを取っておき（`enableFileCheckpointing`）、プロバイダーの `rewindFiles` で発言（`message_uuid`）を送る前の状態に戻す。先に dryRun で量を測ってから戻し、お知らせを残す（`dry_run` なら測るだけ）。その発言のあとでコンテキストを消去していれば、ファイルの記録は消去の前のセッションにあるので、そのセッションで戻す（`sessionAt`）。戻るのは Claude Code の編集のツールで変えたファイルだけ。
- どれも作業中は 409、起点にできない・対応していない・ファイルを戻せないときは 400。

## 子チャット（children.ts）

- 子チャットは `chats` の `parent_chat_id`（親）と `parent_event_id`（聞いた親の発言の記録）を持つふつうのチャット。作るのは `startChildChat`（`POST /api/chats/:id/children`。本文 `ChildChatBody` = 文・添付 `attachments`・選んだ文 `quote`・引き継ぐか `inherit`（既定 true）・`event_id`・選択（画面からは渡さず、`start` の `resolveChatOptions` で既定にする。親の選択は引き継がない）。文か添付のどちらかが要る（チャット欄の「新規の子チャットに送る」は添付だけでも送れる）。201 で子を返す）。親が作業中でも作れる（親は止めない）。
- 引き継ぐときは、親の最後まで終わった作業（`result` の `session_id` / `message_id`。コンテキストの消去より前のものは使わない `resumePointBefore`）からプロバイダーの `fork` で会話を写し、子はそのセッションの続きとして送る。起点がなければ、お知らせ（「引き継げる会話がまだない」）を残して、選んだ文だけで始める。指示は選んだ文を引用（`> `）にして、その下に文。作業場所は親と同じ、名前は文から付ける（`createChat` の `titleText`。画面は選んだ文を引用にして文の頭に入れて送るので、頭の引用の行は名前に使わない `titleSourceOf`）。
- 子チャットの AI には、自分と親チャットを指示に添えて伝える（`chatContext.ts`。`chatContextOf` が送るたびに引き直す、名前と Kickoff のチャット ID・親チャットの名前と ID と Claude Code のセッション ID・孫より深ければ根からの系譜・親の会話で聞いた発言の書き出し（`parent_event_id`。親のものでなければ使わない）と、根から何段目か（子・孫・ひ孫チャット。`@shared/chat/childDepth` の `childDepthLabel`。孫なら親も子チャットだと添える）を、`chatContextNote` が文にして `ProviderTurnParams.turnContext` で渡す）。AI からは Kickoff のチャットが見えず、親の会話を写して始めると自分を親チャットだと思って「親チャットはどれ？」に答えられなかったため。逆に、子チャットのあるチャット（親チャット。それ自身が子チャットでも）の AI には、子孫の一覧（`childrenTree`。`store.chats.descendants` を作った順に、子のすぐ下にその子を字下げして並べる。名前・ID・Claude Code のセッション ID・状態（作業中・終わった・失敗・止めた）・アーカイブ済みか・この会話のどの発言から聞いたか・深さの呼び名（根から数える）。指示を膨らませないよう `MAX_CHILDREN`（30）件までで、残りは数だけ）を添え、「子チャットはどれ？」に答えられるようにする。システムプロンプトに書かないのは、Claude Code が続きのセッションではシステムプロンプトを取り直さず（分岐した子は親のときのもの）、届かないため。親も子もないチャットには添えない。
- 別のプロジェクトへの移動・削除は、子孫ごと（`store.chats.descendants`。深い順。どれかが作業中なら 409）。削除の知らせは子孫の分も出す（DB は `ON DELETE CASCADE` でも消える。画面は知らせで、消えたチャットの右の欄のタブ・子チャットのタブを閉じる）。
- アーカイブは `store.chats.archive(id, archived)` だけで変える（`chats.update` では変えられない）: 親をアーカイブすると、まだアーカイブしていない子孫も一緒にアーカイブし、「親と一緒にアーカイブした」印（`chats.archived_with_parent`。店の中だけで使い、`Chat` には出さない）を付ける（しまっていない子孫のどれかが作業中なら 409）。子チャットだけで先にアーカイブしていたものは、そのまま（日時も変えない）。親を戻すと、印のある子孫だけを戻し、子チャットだけでアーカイブしていたもの（とその下）はアーカイブしたまま。子チャットだけをアーカイブする・戻すときは親に触らない（その子と、その下の一緒にしまったものだけ）。自動のアーカイブ（`archiveStale`）は親のないチャットだけを見て、しまっていない子孫もどれも完了したまま日数がたっていれば、子孫ごとアーカイブする（子チャットは一覧になく、親の中にだけあるため）。メモをゴミ箱に入れたときのメモのチャットのアーカイブも同じ口。
- サブエージェントについて聞く子チャット（`subagentChild.ts` の `startSubagentChildChat`。`POST /api/chats/:id/subagents/:agentId/children`。本文 `SubagentChildBody` = 文・添付・選択。201 で子を返す）: サブエージェント本人には Kickoff から送れず、メインに中継してもらうと答えがメインを通るので、そのサブエージェントの会話の記録を添付にした子チャットで聞く。記録はプロバイダーの `subagentLog`（Claude Code の記録を読むだけ。書き換えない）で、そのサブエージェントを起動したときのセッション（`subagentTranscript.ts` の `sessionOfSubagent`。起動の前の最後の `init`。なければ親の `session_id`）から読む。読めなければ Kickoff に残っている分（依頼・中の発言とツール・報告。`subagentLogFromEvents`）で作り、お知らせでその旨を伝える。Markdown は `subagentTranscript`（依頼・追加の指示・発言・ツール（入力と結果は長ければ頭だけ）・親への報告）で、添付として保存する（`uploads.save`）。指示は `@shared/chat/prompts` の `subagentAskMessage`（添付を先に読み、そのサブエージェントとして続きを答えるよう頼む）。会話は引き継がず（親の会話を写すと、自分をメインエージェントだと思うため）、作業場所は親と同じ、`parent_event_id` はそのサブエージェントを起動した呼び出しの記録。一覧にないサブエージェントは 400。
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
- ツールの結果の画像（`toolImage.ts` の `readToolImage`、`GET /api/chats/:id/tool-image?path=`）: プロバイダーは結果の画像を記録に残さず「[image]」の文字にするので（記録を重くしない）、画面は読むの呼び出しを開いたときに、入力のパスから、いまのファイルを読む。読めるのはチャットの作業場所・本体・添付の保存先・メモのフォルダの中の画像（拡張子は `@shared/chat/toolImage` の `toolImageType`、`MAX_TOOL_IMAGE_BYTES` まで）だけで、リンクを解決してから確かめる（どこでも読めると、API から任意のファイルを取れてしまうため）。外・画像でない・大きすぎるは 400、ないは 404。応答は画像そのもの（`Content-Security-Policy: sandbox`・`nosniff`）と、最後に変えた時刻のヘッダー `x-file-mtime`（読んだあとに変わったかを画面が見分ける）。
- ほかのチャットを参照: `POST /api/chats/:id/transcript` がそのチャットのやり取りを Markdown（`チャット履歴-<名前>.md`）にし、添付として保存して返す（`transcript.ts` の `chatTranscript` / `transcriptFileName`。自分の発言（質問への回答も）・メインの AI の返答と、作業ごとに変えたファイル・失敗・中断だけ。ツールの出力・サブエージェントの発言は入れない）。
- 別のプロジェクトへの移動（`POST /api/chats/:id/move`、`store.chats.move`）: グループ・作業場所・ブランチを外し、作業場所は移った先の本体にする。並び順は変えない。作業中は 409。Claude Code の会話は作業フォルダが変わっても続く。
- 自動のアーカイブ（`autoArchive.ts` の `startAutoArchive`）: 設定の `auto_archive_days` があれば、起動したとき・1 時間ごと・設定を変えたときに、完了・中断のまま日数がたったチャット（未読・固定は除く）をしまう（`store.chats.archiveStale`）。
