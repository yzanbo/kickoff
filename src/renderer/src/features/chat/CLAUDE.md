# チャット（`features/chat`）
<!-- 行き先: src/features/conversation/ -->

チャット全般と 1 つのチャットの画面。音声（`features/dictation/`）とファイルのチップ（`features/fileLinks/`）もここ。まとめ方は `features/chatList/CLAUDE.md`、タブの入れ物は `features/panel/CLAUDE.md`、コアは `src/core/chat/CLAUDE.md`。

| フォルダ | 中身 |
|---|---|
| 直下 | 状態 `chatState.ts`・色 `tones.ts`・印 `StatusSlot`・操作 `chatActions.ts`・名前 `chatTitle.ts`・右クリック `ChatMenuItems` / `DraftMenuItems`・✕ `closeChat.ts` |
| `pane/` | 1 つのチャットの画面（`ChatPane` → 殻 `ChatView` → 会話の欄 `ChatColumn`）・操作の context `chatPaneContext.ts`・見出し・送り方 `useChatSend` |
| `store/` | チャットの店 `chatStore.ts`（読んだ範囲 `chatLog.ts`・読み足し `chatPaging.ts`・取り出し口 `chatSelectors.ts`・先読み `prefetch.ts`） |
| `timeline/` | 流れ（組み立て `timelineItems.ts`・窓 `useTimelineWindow`・見え方の店 `timelineView.ts`・既読 `useMarkSeen`） |
| `messages/`・`tools/` | 発言・返答・質問への回答・選択部分の追加 / ツールの行・コマンドの出力・変更カード |
| `status/` | 作業中の行・動きの目安・裏の作業・通信の切断・圧縮中・預かった指示・ToDo |
| `composer/`・`options/`・`attachments/` | チャット欄・選択（モデル・深さ・権限・ファスト）・添付 |
| `queue/` | 送信待ちと、起動したときの再開の確かめ |
| `subagents/`・`activity/` | サブエージェント（カード・右の欄の画面）/ 動き（全エージェントの時系列） |
| `approvals/`・`prompts/`・`find/` | 承認と質問 / 自分の指示の一覧 / チャットの中の検索 |
| `rewind/` | 巻き戻し・ファイルを戻す・失敗した作業の直す操作 |
| `images/`・`visuals/` | 返答の Markdown の画像 / AI が描いた図 |
| `provider/`・`children/`・`handoff/` | チャットの AI / 子チャット / AI に渡す |

## チャットの AI（`provider/`）
<!-- 行き先: src/features/ai/ -->

- 選んだ AI は送るときの本文の `provider` で、送ったあとは変えない。選べない理由は `providerPickBlock`、決まりは `providerChoice.ts`（テストは隣）。
- その AI にない機能は、`ChatProviderContext` の中の部品が `useFeatureBlock(機能)` で理由を読んで止める（文はコアと同じ `providerFeatureMissing`）。
- AI の状態は入れる側（`useProviderStatus` の `load`）だけが読み込みを頼み、中の部品は読むだけ。
- 前に出しているチャットの AI（`noteForegroundProvider`）は裏のタブで上書きしない（下の帯が読む）。
- AI を替えたら、チャット欄の選択はコアが当て直した値に合わせ直す（`useChatOptions`。前の AI のモデルを送らない）。交代より前の巻き戻し・分岐・ファイルを戻すは、画面でもコアと同じく止める。

## 状態と未読
<!-- 行き先: src/features/chat/ -->

- 状態は `chatStateOf`（`@shared/chat/state.ts` の `agentStateOf`）、色は `tones.ts`。場所ごとに判定を書かない。
- 未読にする記録は `isUnreadEvent`（コアと共有。コアの SQL にも同じ条件がある = JSDoc）。既読にするのは自分で見たときだけ（`timeline/useMarkSeen.ts`）で、返答が届いただけでは消さない。
- `api.markSeen` には一番下まで見た記録の ID を渡す（それより新しい結果があればコアが消さない）。印の付け外しで並び順（最後に動いた時刻）を変えない。

## 操作・名前・メニュー
<!-- 行き先: src/features/chat/ -->

- アーカイブ・削除・移動などは `chatActions.ts` を通す。アーカイブ・削除は既定の閉じ方でも必ず確かめる（取り消しの通知で代えない）。
- 削除したチャットの書きかけ（`chatDraft`・`chatAttachmentsDraft`）も消す。
- 名前はその場で `useChatRename` ＋ `ChatTitleInput` で変える（ダイアログを使わない）。上限は `CHAT_TITLE_MAX`（コアの検証と共通）。
- 右クリックの項目は `ChatMenuItems` 1 つ（サイドバー・ボード・タブで同じ並び）。下書きは `DraftMenuItems` で、同じ並び・文・アイコンにする。
- 「新しいチャット」の作成先の札は `useNewChatPlace` ＋ `NewChatPlaceBadges`。まとまりからの作成先は `features/chatList/buckets.ts` の `newChatPlaceOf`。
- ✕ は `closeChatWithChoice`（既定は `CHAT_CLOSE_ACTION`）。Esc・タブの「閉じる」は聞かずに閉じる。

## 1 つのチャットの画面（`pane/`）
<!-- 行き先: src/features/conversation/ -->

- チャットの画面を描く 5 か所（`ChatPane`・`SideChildChat`・`MemoChatView`・`PopoutChildChat`・`PopoutSubagent`）は `useOpenChat(chatId, visible)` で店を見る。部品で記録の fetch・SSE を持たない。
- 店（`createChatStore`）はチャットごとに 1 つ。同じチャットを何か所で開いても読み込みと SSE は 1 回（別ウィンドウはウィンドウごと）。
- 部品は要る口だけを `useSyncExternalStore` で購読する（`detail`・`log`・`streaming`・`progress`）。差し替えは 1 フレームに 1 回、変わっていない口は同じ値。途中の文は state に入れない。
- `ChatPane` と殻 `ChatView` は記録を読まない（読むと、隠れている間も届くたびに殻ごと描き直す）。記録は会話の欄 `ChatColumn` が読む。
- `ChatColumn` は `Activity` に入れ、止めてよい画面で表示していないときは hidden で止める（`useColumnMode`）。メモのチャット・別ウィンドウは止めない。
- 別ウィンドウからの知らせは殻が `useWindowMessagesFor` で受ける（止めていても）。移る・動きを開くなら、先にタブを表に出す（`TabPageContext` の `show`）。
- 子の部品への操作は `ChatPaneContext`（`ChatPaneActions`）1 つで配り、チャットごとに 1 回だけ作る。props で中継しない・クラス名で DOM を探さない。
- 変わる様子は `useChatPaneState` で読む（保存しない）。画面の外でも描く部品は `useOptionalChatPane` を使う。
- 記録全体から作るもの（サブエージェント・回答待ち・図・ToDo・指示の一覧・失敗した作業・子チャットの帯）は `log.digest`（`digestOf`）から作る。流れは末尾だけを `groupEvents` に渡す。
- 末尾と索引の規則は `src/shared/CLAUDE.md` の「末尾と索引」。どの切れ目でも全件と同じになることを `store/chatLog.test.ts` で確かめる。索引のない詳細はすべてを読んだものとして扱う（`rangeFromDetail`）。
- 読み足しは `chatPaging.ts` で 1 つずつ（すべて読み直したら答えを捨てる）。末尾より前で巻き戻したら末尾から読み直す。
- SSE をつなぎ直したら、見ているチャットは `?after=` で足りない分を読む（記録が消えていれば末尾から）。
- 先読みは `prefetchChats`（同時に 1 件・手すきのとき）と、画面全体で 1 つの見張り `store/hoverPrefetch.ts` を通す。
- 書いている途中の返答の足す・消すは `@shared/chat/streamingRules` の `streamingEffectOf`（コア・スマホと共有）。読み込み中に届いた分は `chat_delta` の `offset` で重なりを捨てる。
- 途中の文を消すときは購読者に知らせずに世代を進め、記録の口の差し替えで `streamGen` を進める（確定と消えを同じ 1 回の描き直しにする）。
- チャットのキーは `useChatHotkey` で、ピントがそのチャットにあるときだけ捕捉で先に受ける。隠れたタブ・閉じたパネルでは受けない。

### 見出し

- 見出しはウィンドウのドラッグ領域にしない（右クリックが画面に届かなくなる）。
- 表示のメニューは `ChatDisplayItems` 1 つ（見出し・指示の帯・会話の何もないところの右クリック）。見出しの外にも置くのは、隠した見出しを戻せるようにするため。
- 見出しの項目は `chatHeaderItems.ts`。覚えるのは隠した項目 `CHAT_HEADER_HIDDEN` と並び `CHAT_HEADER_ORDER` だけ（空の一覧も覚え、初めの値に戻さない）。
- 会話に出る部品の CSS で文字の大きさ・行の高さを足すときは `calc(… * var(--chat-scale, 1))` にする（会話の文字の大きさの倍率）。
- 送る前のチャット（`NewChatPane`・`NewChildPane`）も同じ枠 `DraftChatPage` で描き、見出しとチャット欄をそろえる。

## 流れ（`timeline/`）
<!-- 行き先: src/features/conversation/ -->

- `groupEvents` は終わった作業の分を作業の終わりの記録ごとに覚え、配列を作り直さない。
- 項目は 1 つずつ `.timeline-row` に包む（測る・描くのを省く単位）。作業中かは props で渡さず `TimelineBusyContext` で配る。
- 開閉・測った高さ・読んでいた位置は見え方の店 `timelineView.ts`（メモリだけ）に置き、部品は `useTimelineOpen(chatId, key)` で自分のキーだけを購読する。テストは `createTimelineViews(limit)` で作る。
- 窓（`useTimelineWindow`。`hooks/useRowWindow.ts` を包む）の外は、測った高さか見積もり（`rowEstimate.ts`）の箱。選んでいる・ピントのある・書く欄のある行は外さない。
- 読み足しは読んだ範囲の始まりの手前で始める（端で足すとトラックパッドの慣性が止まる）。移る処理のあと 1.5 秒は読み足さない。
- 読んでいた位置はブラウザのスクロールアンカーに任せ、いちばん上（scrollTop 0）で前に項目が増えたときだけ JS で直す（`docs/architecture.md` の「決めたこと（測った数）」）。
- 移る処理はどれも `ChatPaneActions.reveal(記録の ID)` を待ってから移る。描いている範囲に頼るもの（検索の印・上に貼り付ける指示）は `drawn` で確かめ直す。
- 一番下への付いていきは `useFollowBottom` が大きさの知らせ（`hooks/useSizeObserver.ts`）で行う。`scrollHeight` を毎フレーム読まず、項目の数を依存に持たない。
- 上へ戻す操作は、スクロールの知らせより先に付いていきをやめ（`holdUp`）、スクロールし終えるまで付き直さない。
- 強調の `.flash` は光り終えたら外す（光っている間は描くのを省くのをやめている）。色はアクセント（黄は検索と注意の色）。
- 書いている途中の返答（`StreamingReply`）は文を props・state で渡さず店の口から読み、見えていない間は rAF を回さない。書きかけの記号は `lib/markdownReveal.ts` で手前で止める。
- 作業場所を移した区切りより前の行は `PastWorkplace` で包み、ファイル・画像をそのときの作業場所から開く。区切りより前の書き直し・分岐・巻き戻しは止める（`useBeforeWorkplaceMove`）。
- 一番下へ戻るボタンはピルの列の右端に置き、入らないときだけ流れの右下に浮かせる（列を 1 行増やさない。入るかは置き場所によらない幅で決める）。

## 返答の画像（`images/`）
<!-- 行き先: src/features/remoteImages/ -->

- Markdown の画像の描き方を入れるのは、チャットの画面の `ChatImagesProvider` だけ。利用者が押すまで外へ通信しない・画面の CSP は開けない。
- 画像は `<p>` の中に描かれるので、中に置けない要素は body に出し（`Popover` の `portal`）、中の押す操作は包むリンクに届かせない。失敗の文も span。
- 許可を外したら、そのホストの blob も捨てる（`forgetRemoteImages`）。コアは `src/core/CLAUDE.md` の「外の画像」。

## 図（`visuals/`）
<!-- 行き先: src/features/visuals/ -->

- 枠は `VisualFrame`（`allow-same-origin` なし）。図から送る発言は、利用者が枠の中を押したときだけ受ける（`pressedInside`）。理由は各関数の JSDoc。
- 枠は画面の手前まで来てから置き、同時に読み込むのは `useFrameSlot` の数まで。触った図は `data-keep-row` で窓から外さない。
- テーマを変えたら SVG は変数だけを送り、HTML は読み直す。テーマの値は `visualTheme.ts` が `styles/base/tokens.css` の末尾の一覧から読む（変数を足したら一覧も直す）。
- 中のページは、上限より低い中身では縦のスクロールバーを出さない（幅が縮んで高さが変わり、行き来する）。

## 発言（`messages/`）
<!-- 行き先: src/features/conversation/ -->

- 返答のコピーは書式付きの `copyRich`、選択部分は `ui/markdown/selectionMarkdown.ts` で Markdown に戻してから。どの右クリックもこの形にそろえる。
- 書き直し・ファイルを戻すは、チャットの画面の中で作業中でないときだけ。ファイルを戻すは `api.rewindFiles` を先に dry run して見せる。
- コードの色付けは書き終えた返答だけに Worker で付け、文字と高さを変えない。

### 選択部分をチャットに追加

- 「添付」はファイル全体にだけ使い、選択部分は「追加」と呼ぶ。足す先のチャットは、どのタブでも名前で呼ぶ。
- 選べる入れ物は `messages/quotable.ts` の `QUOTABLE_ATTR` を付け、丸ごと足せるまとまりには `data-quote-text` と `data-quote-noun` を付ける。
- 引用はチャット欄の文の後ろに足す（`fillComposer` の `append`）。送るのは利用者。
- 右の欄・別ウィンドウから足すのは `pane/addToChat.ts` の `addToChat` 1 つ（画面がなければ書きかけに足す）。足す先は `MainChatContext` で知り、その中ではチャット自身の `SelectionAttach` を出さない。
- 流れの右クリック（`useQuoteMenu` の `openInRegion`）は、自分のメニューを開いた所（`defaultPrevented`）と書く欄の上を任せる。
- 開閉する行の文をドラッグで選んだら、離したときの押下を止める（`keepSelectionOnClick` を `onClickCapture` に）。
- コードの行の引用は `[data-quote-path]` の `.diff-code[data-no]` から、Monaco は `features/editor/codeSelection.ts` から読む。

## ツール（`tools/`）
<!-- 行き先: src/features/conversation/ -->

- ツールの行は人が読める文にする（`toolDescribe.ts`。生の JSON を出さない）。承認カードは `describeApprovalInput`、まとまりの要約は `summarizeTools`。
- AI のツール（`@shared/chat/ai*.ts` の名前）を足したら、`toolDescribe.ts` に行の文を足す。
- 閉じた中身は `ui/LazyDetails` で初めて開くまで作らない（色付けも開いてから）。
- 裏で動かしたコマンドは、裏の作業の一覧（`ChatLive.background`）に残る間は実行中に見せる（`BackgroundCallsContext`）。前の作業で結果のない呼び出しは中断。
- 実行中のコマンドの出力（SSE `chat_command_output`）はキーごとの店 `commandOutputs.ts` に入れ、届いた部品だけを描き直す。
- AI が開く・入れるツールの頼みは `app/aiOpenRequests.ts` がメインのウィンドウでだけ受ける。まだ読んでいない系譜のチャットは、開く前に `addChats` で一覧に入れる。
- 読んだ画像（`ReadImage`）は開いたときに今のファイルを読む。読むまでは前に描いた高さ（`readImageHeights.ts`）で場所を取り、知らない画像の高さは見積もらない。

## 作業中の様子（`status/`）
<!-- 行き先: src/features/conversation/ -->

- 作業中の行の文は `workingLabel`。`useWorkingStatus` が 1 回だけ組み立て、一番下へ戻るボタンと共有する。
- 作業の札（`WorkingExecution`）は今回の `init` の通知か送ったときの選択から（`executionSettings.ts`）。前の作業の通知を使わない。
- 動いているかは最後に何かが届いた時刻で決める（`stall.ts`。Claude Code に問い合わせる手段はない）。子孫が動いている間は、待っている祖先を動きなしにしない。
- 中断は、裏のサブエージェント・コマンドも止まることを確かめてから（`confirmStopAgents`）。停止中は Esc でも止め直さない。
- 作業中の「会話を圧縮」は、圧縮前指示があればいまの作業へ伝え（`compact_after_turn`）、なければ送信待ちのいちばん上に予約する（`reservedAction`）。
- ToDo は `todoList.ts` の `collectTodoList`。セッションが替わると Task の番号が振り直されるので、それまでの分を締める。

## 失敗した作業の直す操作（`rewind/`）
<!-- 行き先: src/features/conversation/ -->

- いちばん新しい作業の失敗だけに出す（`retryActions.ts` の `failedTurnOf`。通信の切断・使用枠の上限は除く）。選択肢は `useRetryChoices`（モデルの一覧が届いたら作り直す）。深さ・モデルを変えたら、チャット欄の選択も同じに変える。

## チャット欄（`composer/`・`options/`・`attachments/`）
<!-- 行き先: src/features/composer/ -->

- 並びは上から、流れ → 同じ作業場所で作業中のチャットの知らせ → ピル → 定型文の帯 → 送信待ち → 入力欄（`ChatComposerArea`）。
- チャットへの送り方は `useChatSend` 1 本。出どころ `handoff_from` を付けるのは入力欄から送るもの（`onSend`・`onQueue`・`onAsk`）だけで、定型文の「すぐ送る」・もう一度送るは `onSendOther`。
- ピル（`ComposerChip`）の一覧は、開いているときだけ呼ぶ関数（`children: () => ReactNode`）で渡す。言葉は `ChipWord`・`.chip-detail`・`.chip-short-icon` の形にする（狭い所でアイコンと数だけにする）。
- ピルの列・送信待ちを外の描く先（`ChipsPortalContext`・`queueTarget`）に描くときは、会話へ移る操作の前に `reveal` で画面を見せる。
- 外から入力欄を動かすのは `handleRef`（`ComposerHandle` の `fill` / `insert` / `focus`）だけ。書きかけは `chatDraft(chatId)`。
- 高さは CSS（`field-sizing: content`）で伸ばす。コンパクトは `compact` のクラスで、送信待ち・ピルの列にも付ける（兄弟かでは見分けない）。
- 下の行は 1 行に収める（`useComposerBarFit`）。決め打ちの幅で切り替えず実際に測り、中身の幅が変わる値が変わったら測り直す。
- Esc は 2 回で中断（パネルを閉じるのにも使うため）。録音中・候補の一覧などで先に扱ったキーは見ない。
- 選択は `useChatOptions`（4 つ目の引数がチャットの AI）。一覧にないモデルは見せるときだけ既定にする（`fallbackModel`。送る値は直さない）。Fast は対応が分からない間、保存した希望を消さず実行にも渡さない。
- 添付は選んだ時点でアップロードし、送るか外すまで残す（`chatAttachmentsDraft`・タブの `draftAttachments`）。入力欄がなくなってから終わったアップロードも残す先へ足す。
- 添付を足すときは `mergeAttachments` で同じものを入れ替える。札は `AttachmentChip` 1 つ（入力欄・発言・送信待ち）。
- ほかのチャットを読ませるのは「参照」と呼ぶ（`ChatContextButton`）。

### 作業中の送り方（いま / あとで）

- 作業中の扱いは `QUEUE_MODE`（`tell` = いま / `queue` = あとで）とキー（⌘Enter / ⌘⇧Enter。`sendModeOf`）。作業していなくて送信待ちが残るときは「すぐ送る / ためておく」にする（`queueWhileIdle`）。
- 「いま」は `api.tellChat`。伝えられないとき（`tells_closed`）と圧縮を待つ間（`awaiting_compact`・`compacting`・`compacted_turn`）はコアが預かり（`after_compact`）、作業の終わりに送信待ちより先に送る。
- 圧縮後指示は送信待ちに入らない。預かった指示の書き直しは `status/HeldEditComposer.tsx`（状態は `status/heldEdit.ts`）。
- 書き直している間は `api.setAfterCompactEditing` を `EDIT_HOLD_TTL_MS` の 1/4 ごとに知らせ直す（送信待ちと同じ）。保存の前に送られたら、書いた文をふつうのチャット欄に移す。
- 会話の圧縮中は停止のボタンを出さない（`plainActions`）。止めるのは Esc 2 回。
- 「質問として送る」（`onAsk`）は、同じ送り方でコアに `pause_after` を付ける。

## 送信待ち（`queue/`）
<!-- 行き先: src/features/queue/ -->

- 状態は `ChatLive.queue`（`QueueState`）。変える API の応答も同じ形で、受けたら丸ごと置き換える。
- 起動したときの再開（`ChatLive.restart_resume`）は、決めるまでコアが続けず送らない。一覧は `stores/restartResumes.ts`、ダイアログはメインのウィンドウだけ。コアのプロセスを作り直したあとに止まったチャットでも開く（`autoOpenRestartResumes`）。
- 一時停止の印は指示に付けず、列の位置で持つ。純粋関数は `@shared/chat/queueStops.ts`（コアの並べ替えと画面の予測で共有）。
- 落としたら応答を待たずに落とした形を出し（`useQueuePrediction`）、サーバーの並びが変わった・送れなかった・3 秒たったら戻す。
- 送った指示は、流れか預かりの吹き出しに出るまで「送信中…」で残す（`useSendingQueued`。コアは送信待ちから外してから発言を記録する）。
- 送信待ちを消す API は、呼ぶ前に `api/queueRemovals.ts` の `noteQueuedRemoved` で覚える（応答より先に送信待ちの知らせが届く）。消したものは「送信中」にしない。
- 次に送る指示を書き直している間は `api.setQueueEditing` を `EDIT_HOLD_TTL_MS` の 1/4 ごとに知らせ直す（落ちたら持ち時間で外れて送る）。一覧をたたんだら書きかけを捨てる（`discardAll`）。
- `/clear`（`isClearCommand`）は Claude Code に送らず、コアがコンテキストの消去にする。候補の説明は `CLEAR_COMMAND_DESCRIPTION`。
- 挟む行（圧縮・消去）のアイコン・色・文言は `QUEUE_ACTION_LOOKS` 1 か所。ドラッグの絵はアプリ共通の `ui/dragGhost.ts`。

## サブエージェント（`subagents/`）
<!-- 行き先: src/features/subagents/ -->

- サブエージェントはパネルのタブにせず、流れのカードと右の欄の画面（`SubagentScreen`）で見せる。共通の部品は `subagentParts.tsx`。開くのは `openSubagent`（設定の開き方）か `openSubagentSide`。
- 一覧の組み立ては `@shared/chat/subagents.ts`（コアと共有）。行は作業 ID でまとめる（SendMessage で再開すると呼び出し ID が替わる）。
- 状態は `@shared/chat/subagentState.ts` の `subagentState` だけで決め、印・数・文・色はすべてこれから引く（場所ごとに判定を書かない）。
- 色（`agentHues.ts`）は外側に起動した順に決め、入れ子は外側の祖先と同じ色。あとから足しても前の色を変えない（アーカイブしたものも含めて決める）。
- 孫より深いものの中の手順は Claude Code が送ってこない。途中経過の時刻は祖先の「最後の動き」に伝える（`bubbleProgress`）。
- カードの中の流れは描く側から `renderItems` で渡す（流れの部品を読むと輪になる）。
- 手順の項目は `subagentEvents.ts` で選んでから `groupEvents` に渡し、中身が同じなら同じ配列を返す（`subagentEvents.test.ts` で全体と比べる）。
- 伝える入力欄はカードの中に開く（チャット欄の宛先は切り替えない）。Kickoff から直接は送れないので、メインエージェントに SendMessage で伝えてもらう（`relayMessage`）。ID が届いていなければ出さない。
- 伝える入力欄を開いている間は一番下への付いていきを止める。Esc はパネルを閉じる Esc に渡さない。
- 子チャットで聞く（`api.askSubagentInChild`）の最初の発言は前置き（`subagentAskMessage`）を隠して出し、送り直すときは付け直す。

## 動き（`activity/`）
<!-- 行き先: src/features/conversation/ -->

- 会話と動きは同じタブの中で切り替え、会話は隠しても描いたまま残す（読んでいた位置・開いたカードを保つ）。
- 行は `activityRows.ts`、線は `activityRails.ts`（全体で決めてから `flipRails` で上を最新にする）。
- 窓は `useRowWindow` を新しい側を上にして使う（`useActivityWindow`）。絞り込みを変えたら窓を作り直す。

## 承認と質問（`approvals/`）
<!-- 行き先: src/features/conversation/ -->

- 回答は `useResolve` で送る（送れたらカードごと消えるので、送信中のまま待つ）。
- 承認カードの SQL・依頼は切らずに全文出す（確かめられるように）。
- 質問のカードは、1 問ずつ・たたんだときも欄を作り直さずに隠す（書いた文・添付を残す）。
- 「その他」の添付は、コアが回答の文にパスを書き添える（AskUserQuestion の回答は文字だけ）。

## 指示の一覧（`prompts/`）
<!-- 行き先: src/features/conversation/ -->

- 自分の指示の一覧は `promptListOf` で 1 回だけ作り、履歴・⌘⌥↑ / ↓・上に貼り付ける指示・↑↓ の呼び出し・巻き戻しで共有する。番号は指示だけに振る。
- 指示の位置は窓の和（`topOf`）で読み、線をまたぐ行だけ吹き出しを読む（描くのを省いた行の中を読むとレイアウトを強いる）。
- 上に貼り付ける指示は、吹き出しが窓にないときは記録から出す（`promptBefore`）。一度選んだら線より下へ戻るまで出し続け（`PinnedHold`）、帯が替わってもスクロールを合わせない。
- 帯の段の列は `minmax(0, 1fr)`（auto だと長い指示の幅まで広がる）。

## チャットの中の検索（`find/`）
<!-- 行き先: src/features/conversation/ -->

- 欄は共有の `ui/FindField`・`ui/FindOptionButtons`・`hooks/useFindOptions`。照らし合わせは記録と画面の印で共通の `lib/textFind.ts`。
- 探すのは記録から（`chatFindMatches.ts`）。末尾より前の本文はコアの `texts?before=` で読み、正規表現はコアで流さない。
- 印は描いている範囲だけに CSS Custom Highlight API で付ける（DOM を書き換えない）。

## 音声入力と音声モード（`features/dictation/`）
<!-- 行き先: src/features/voice/ -->

- 欄に入れる音声入力は `useFieldDictation` で共有する（質問の「その他」・送信待ちの書き直す欄）。入れ方は純粋関数の `insertDictation`。
- 長押しを離したのは window の pointerup で受ける（録音中はボタンが描き替わる）。
- 長い録音は `PART_BYTES` ごとに、次の録音を先に始めてから止めて区切る（文字起こしの 1 回は 25MB まで）。
- 音量は描き直さずに `--mic-level` に入れる（`useMicLevel`）。
- 音声モードの中身は React に依存しない `voiceSession.ts`。送る前のチャットから続けるときは `voiceHandoff.ts` で渡す（StrictMode の描き直しでも戻す）。
- 読み上げる文は `speakableText`。準備の状態は `useVoiceStatus`、設定は `features/settings/CLAUDE.md`。

## 返答のファイルのチップ（`features/fileLinks/`）
<!-- 行き先: src/features/files/ -->

- チップにするのはチャットのパネルの中（`FileLinksProvider`）だけ。開く関数は同じものにして返答の Markdown を描き直させない。`FileMenu` は 1 つだけ描く。
- remark の差し込みは一覧を受け取らずにパスらしい文字に印を付け、開けるかはリンクの部品が `fileIndexStore.ts` から自分の分だけ読む（一覧を取り直しても解析し直さない）。
- 開き方は `open` 1 つで、チップ・変更カード・ツールの行で共有する。右の欄の中身は `features/editor/CLAUDE.md`。

## AI に渡す（`handoff/`）
<!-- 行き先: src/features/attachments/ -->

- 渡すものは各タブが `HandOffItem`（`handOff.ts`）で作り、中身は押した時点で取る。どの渡し先も入力欄で止め、送るのは利用者。
- ボタンは `HandOffButton`・項目は `HandOffItems`、渡し先は `HAND_OFF_TARGETS`。別ウィンドウからはメインのウィンドウに頼む（`openSeededChat`）。

## 子チャット（`children/`）
<!-- 行き先: src/features/childChats/ -->

- 子チャットの選択は親から引き継がず設定どおり（コアの `resolveChatOptions`）。一覧（`selectChats`）に出さず、親の中だけに置く（`stores/chats.ts` の `childChatsOf`）。
- 作った子チャットは、知らせを待たずに `addChat` で一覧に入れてから開く（入っていないと親をたどれず、ふつうのタブで開く）。
- 作ったときの開き方は `openCreatedChild`、開き方は `openChildChat`、新しい子チャットのタブは `openAskChild`。別ウィンドウからはメインのウィンドウに頼む。
- 右の欄の子チャット（`SideChildChat`）には右の欄を重ねない（`PanelHostContext` を null）。親の画面が見えていなければ先に開く（`openInRootSide`）。
- 引用は入力欄の文に入れて送る（API の `quote` は送らない）。
- 上の帯は `ChildBarFrame` 1 つ。親の札の 1 回押しは `REVEAL_DELAY_MS` 待つ（ダブルクリックの名前の変更と分ける）。
- 新しくできた子の明滅（`freshChildren`）は、会話の欄を隠している間は光らせない。
- 親から外すのは `detachChild.ts`（確かめてから `api.detachChat`。作業中は外さない）。親のないチャットにしたら右の欄のタブを閉じる（`reopenDetached`）。
- 親への依頼文の頼み方は `@shared/chat/handoff`。利用者が自分で頼み直しても同じ形になるよう、コアの `chatContext.ts` にも 1 行ある（変えたら両方）。
- 親に渡したあとの削除は、今すぐ送った・送信待ちに入れたときだけ（`handoffAfterFor`。入力欄に入れたときはアーカイブ）。
- アーカイブ・削除は子孫ごと（コアの決まり）。確かめの文は `chatActions.ts` の `childNote`、数は `knownDescendantCount`。
- タブの名前のボタンの中の印（`ChildActivityMark`）は `role="button"` の span にし、一覧は body に出して、中のクリック・キーをタブに届かせない（Esc は止めない）。
