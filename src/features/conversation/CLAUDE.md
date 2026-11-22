# 会話の画面（`src/features/conversation`）

1 つのチャットの画面・流れ・発言・ツールの表示・検索・状態の行・動き・承認・巻き戻し（パスは `ui/` から）。チャットの店・状態・操作は `src/features/chat/CLAUDE.md`、入力欄は `src/features/composer/CLAUDE.md`、まとめ方は `src/features/chatList/CLAUDE.md`、タブの入れ物は `src/features/panel/CLAUDE.md`。

| フォルダ | 中身 |
|---|---|
| `screen/`・`screens/` | 1 つのチャットの画面（`ChatScreen` → 殻 `ChatShell` → 会話の欄 `ChatColumn`）・見出し・右の欄の子チャットとサブエージェントの画面 |
| `timeline/`・`streaming/` | 流れ（組み立て `timelineItems.ts`・窓 `useTimelineWindow`・既読 `useMarkSeen`）・書いている途中の返答 |
| `messages/`・`tools/` | 発言・返答・質問への回答・選択部分の追加 / ツールの行・コマンドの出力・変更カード |
| `working/`・`background/`・`todo/` | 作業中の行・動きの目安 / 裏の作業 / ToDo |
| `activity/`・`approvals/` | 動き（全エージェントの時系列）/ 承認と質問 |
| `promptList/`・`find/`・`rewind/` | 自分の指示の一覧 / チャットの中の検索 / 巻き戻し・失敗した作業の直す操作 |

チャットの店（`chatStore.ts`・読んだ範囲 `chatLog.ts`・読み足し `chatPaging.ts`・先読み `prefetch.ts`）と見え方の店 `timelineView.ts` は `@/features/chat/ui/`、画面の口の型と context は `@/features/chat/ui/screen/ports.ts`。

## 1 つのチャットの画面（`screen/`）

- チャットの画面は `ChatScreen` 1 つ。置く側は違いを `ChatHost`（`@/features/chat/ui`）で渡す。読み込みの印 `ready` で殻を描き、配るものは `ChatEnvironment`。
- 店（`createChatStore`）はチャットごとに 1 つ。同じチャットを何か所で開いても読み込みと SSE は 1 回（別ウィンドウはウィンドウごと）。
- 部品は要る口だけを `useSyncExternalStore` で購読する（`detail`・`log`・`streaming`・`progress`）。差し替えは 1 フレームに 1 回、変わっていない口は同じ値。途中の文は state に入れない。
- `ChatScreen` と殻は記録を読まない（読むと、隠れている間も届くたびに殻ごと描き直す）。記録は会話の欄 `ChatColumn` が読む。
- `ChatColumn` は `Activity` に入れ、止めてよい画面で表示していないときは hidden で止める（`useColumnMode`）。ノートのチャット・別ウィンドウは止めない。
- 殻は登録簿（`chatScreens.ts`）に載る（止めていても）。別ウィンドウからの移る・動きを開くは、先にタブを表に出す（`bringToFront`）。
- 操作は持ち主ごとの口（`TimelineNav` など）で配り、`createScreenActions` で 1 回だけ作る。props で中継しない・DOM を探さない。
- 口は描いた値（窓・送り方）だけを `setWindow`・`setSend` で受け、ほかは店から読む。画面の外でも描く部品は `useOptional…`。
- 記録から作るもの（サブエージェント・図・ToDo・指示の一覧・流れの項目 `timelineItems` など）は持ち主の取り出し口（`defineChatSelector`）で読む。記録の配列を props で渡さない。
- 末尾と索引の規則は `src/shared/CLAUDE.md` の「末尾と索引」。どの切れ目でも全件と同じになることを `@/features/chat/ui/store/chatLog.test.ts` で確かめる。索引のない詳細はすべてを読んだものとして扱う（`rangeFromDetail`）。
- 読み足しは `chatPaging.ts` で 1 つずつ（すべて読み直したら答えを捨てる）。末尾より前で巻き戻したら末尾から読み直す。
- SSE をつなぎ直したら、見ているチャットは `?after=` で足りない分を読む（記録が消えていれば末尾から）。
- 先読みは `prefetchChats`（同時に 1 件・手すきのとき）と、画面全体で 1 つの見張り `@/features/chat/ui/store/hoverPrefetch.ts` を通す。
- 書いている途中の返答の足す・消すは `@shared/chat/streamingRules` の `streamingEffectOf`（コア・スマホと共有）。読み込み中に届いた分は `chat_delta` の `offset` で重なりを捨てる。
- 途中の文を消すときは購読者に知らせずに世代を進め、記録の口の差し替えで `streamGen` を進める（確定と消えを同じ 1 回の描き直しにする）。
- チャットのキーは `useChatHotkey` で、ピントがそのチャットにあるときだけ捕捉で先に受ける。隠れたタブ・閉じたパネルでは受けない。

### 見出し

- 見出しはウィンドウのドラッグ領域にしない（右クリックが画面に届かなくなる）。
- 表示のメニューは `ChatDisplayItems` 1 つ（見出し・指示の帯・会話の何もないところの右クリック）。見出しの外にも置くのは、隠した見出しを戻せるようにするため。
- 見出しの項目は `chatHeaderItems.ts`。覚えるのは隠した項目 `headerHidden` と並び `headerOrder` だけ（空の一覧も覚え、初めの値に戻さない）。
- 会話に出る部品の CSS で文字の大きさ・行の高さを足すときは `calc(… * var(--chat-scale, 1))` にする（会話の文字の大きさの倍率）。
- 送る前のチャット（`NewChatPane`・`NewChildPane`）も同じ枠 `DraftChatPage` で描き、見出しとチャット欄をそろえる。

## 流れ（`timeline/`・`streaming/`）

- `groupEvents` は終わった作業の分を作業の終わりの記録ごとに覚え、配列を作り直さない。
- 項目は 1 つずつ `.timeline-row` に包む（測る・描くのを省く単位）。作業中かは props で渡さず `TimelineBusyContext` で配る。
- 開閉・測った高さ・読んでいた位置は見え方の店 `timelineView.ts`（メモリだけ）に置き、部品は `useTimelineOpen(chatId, key)` で自分のキーだけを購読する。テストは `createTimelineViews(limit)` で作る。
- 窓（`useTimelineWindow`。`timeline/rowWindow/useRowWindow.ts` を包む）の外は、測った高さか見積もり（`rowEstimate.ts`）の箱。選んでいる・ピントのある・書く欄のある行は外さない。
- 読み足しは読んだ範囲の始まりの手前で始める（端で足すとトラックパッドの慣性が止まる）。移る処理のあと 1.5 秒は読み足さない。
- 読んでいた位置はブラウザのスクロールアンカーに任せ、いちばん上（scrollTop 0）で前に項目が増えたときだけ JS で直す（`docs/architecture.md` の「決めたこと（測った数）」）。
- 移る処理はどれも `TimelineNav.reveal(記録の ID)` を待ってから移る。描いている範囲に頼るもの（検索の印・上に貼り付ける指示）は `drawn` で確かめ直す。
- 一番下への付いていきは `useFollowBottom` が大きさの知らせ（`@/foundation/ui/hooks/useSizeObserver.ts`）で行う。`scrollHeight` を毎フレーム読まず、項目の数を依存に持たない。
- 上へ戻す操作は、スクロールの知らせより先に付いていきをやめ（`holdUp`）、スクロールし終えるまで付き直さない。
- 強調の `.flash` は光り終えたら外す（光っている間は描くのを省くのをやめている）。色はアクセント（黄は検索と注意の色）。
- 書いている途中の返答（`StreamingReply`）は文を props・state で渡さず店の口から読み、見えていない間は rAF を回さない。書きかけの記号は `streaming/markdownReveal.ts` で手前で止める。
- 作業場所を移した区切りより前の行は `PastWorkplace` で包み、ファイル・画像をそのときの作業場所から開く。区切りより前の書き直し・分岐・巻き戻しは止める（`useBeforeWorkplaceMove`）。
- 一番下へ戻るボタンはピルの列の右端に置き、入らないときだけ流れの右下に浮かせる（列を 1 行増やさない。入るかは置き場所によらない幅で決める）。

## 発言（`messages/`）

- 返答のコピーは書式付きの `copyRich`、選択部分は `@/foundation/ui/kit/markdown/selectionMarkdown.ts` で Markdown に戻してから。どの右クリックもこの形にそろえる。
- 書き直し・ファイルを戻すは、チャットの画面の中で作業中でないときだけ。ファイルを戻すは `api.rewindFiles` を先に dry run して見せる。
- コードの色付けは書き終えた返答だけに Worker で付け、文字と高さを変えない。

### 選択部分をチャットに追加

- 「添付」はファイル全体にだけ使い、選択部分は「追加」と呼ぶ。足す先のチャットは、どのタブでも名前で呼ぶ。
- 選べる入れ物は `messages/quotable.ts` の `QUOTABLE_ATTR` を付け、丸ごと足せるまとまりには `data-quote-text` と `data-quote-noun` を付ける。
- 引用はチャット欄の文の後ろに足す（`ComposerPort.fill` の `append`）。送るのは利用者。
- 右の欄・別ウィンドウから足すのは `@/features/composer/ui/addToChat.ts` の `addToChat` 1 つ（画面がなければ書きかけに足す）。足す先は `MainChatContext` で知り、その中ではチャット自身の `SelectionAttach` を出さない。
- 流れの右クリック（`useQuoteMenu` の `openInRegion`）は、自分のメニューを開いた所（`defaultPrevented`）と書く欄の上を任せる。
- 開閉する行の文をドラッグで選んだら、離したときの押下を止める（`keepSelectionOnClick` を `onClickCapture` に）。
- コードの行の引用は `[data-quote-path]` の `.diff-code[data-no]` から、Monaco は `@/foundation/ui/code/codeSelection.ts` から読む。

## ツール（`tools/`）

- ツールの行は `toolText()`（`@/features/chat/ui`）の文にする（生の JSON を出さない）。語彙は Claude Code が `@shared/ai/claudeTools.ts`、Kickoff は持ち主の `@shared/<機能>/tools.ts`（足したら束ね `src/app/shared/aiToolViews.ts` にも）。
- 閉じた中身は `LazyDetails` で初めて開くまで作らない（色付けも開いてから）。
- 裏で動かしたコマンドは、裏の作業の一覧（`ChatLive.background`）に残る間は実行中に見せる（`BackgroundCallsContext`）。前の作業で結果のない呼び出しは中断。
- 実行中のコマンドの出力（SSE `chat_command_output`）はキーごとの店 `commandOutputs.ts` に入れ、届いた部品だけを描き直す。
- AI が開く・入れるツールの頼みは `@/features/chat/ui/open/aiOpenRequests.ts` がメインのウィンドウでだけ受ける。まだ読んでいない系譜のチャットは、開く前に `addChats` で一覧に入れる。
- 読んだ画像（`ReadImage`）は開いたときに今のファイルを読む。読むまでは前に描いた高さ（`readImageHeights.ts`）で場所を取り、知らない画像の高さは見積もらない。

## 作業中の様子（`working/`・`background/`・`todo/`）

- 作業中の行の文は `workingLabel`。`useWorkingStatus` が 1 回だけ組み立て、一番下へ戻るボタンと共有する。
- 作業の札（`WorkingExecution`）は今回の `init` の通知か送ったときの選択から（`executionSettings.ts`）。前の作業の通知を使わない。
- 動いているかは最後に何かが届いた時刻で決める（`@/features/chat/ui/state/stall.ts`。Claude Code に問い合わせる手段はない）。子孫が動いている間は、待っている祖先を動きなしにしない。
- 中断は、裏のサブエージェント・コマンドも止まることを確かめてから（`confirmStopAgents`）。停止中は Esc でも止め直さない。
- 作業中の「会話を圧縮」は、圧縮前指示があればいまの作業へ伝え（`compact_after_turn`）、なければ送信待ちのいちばん上に予約する（`reservedAction`）。
- ToDo は `todo/todoList.ts` の `collectTodoList`。セッションが替わると Task の番号が振り直されるので、それまでの分を締める。

## 失敗した作業の直す操作（`rewind/`）

- いちばん新しい作業の失敗だけに出す（`rewind/retryActions.ts` の `failedTurnOf`。通信の切断・使用枠の上限は除く）。選択肢は `useRetryChoices`（モデルの一覧が届いたら作り直す）。深さ・モデルを変えたら、チャット欄の選択も同じに変える。

## 動き（`activity/`）

- 会話と動きは同じタブの中で切り替え、会話は隠しても描いたまま残す（読んでいた位置・開いたカードを保つ）。
- 行は `activityRows.ts`、線は `activityRails.ts`（全体で決めてから `flipRails` で上を最新にする）。
- 窓は `useRowWindow` を新しい側を上にして使う（`useActivityWindow`）。絞り込みを変えたら窓を作り直す。

## 承認と質問（`approvals/`）

- 回答は `useResolve` で送る（送れたらカードごと消えるので、送信中のまま待つ）。
- 承認カードの SQL・依頼は切らずに全文出す（確かめられるように）。
- 質問のカードは、1 問ずつ・たたんだときも欄を作り直さずに隠す（書いた文・添付を残す）。
- 「その他」の添付は、コアが回答の文にパスを書き添える（AskUserQuestion の回答は文字だけ）。

## 指示の一覧（`promptList/`）

- 自分の指示の一覧は `promptListOf` で 1 回だけ作り、履歴・⌘⌥↑ / ↓・上に貼り付ける指示・↑↓ の呼び出し・巻き戻しで共有する。番号は指示だけに振る。
- 指示の位置は窓の和（`topOf`）で読み、線をまたぐ行だけ吹き出しを読む（描くのを省いた行の中を読むとレイアウトを強いる）。
- 上に貼り付ける指示は、吹き出しが窓にないときは記録から出す（`promptBefore`）。一度選んだら線より下へ戻るまで出し続け（`PinnedHold`）、帯が替わってもスクロールを合わせない。
- 帯の段の列は `minmax(0, 1fr)`（auto だと長い指示の幅まで広がる）。

## チャットの中の検索（`find/`）

- 欄は共有の `FindField`・`FindOptionButtons`・`useFindOptions`（`@/foundation/ui/`）。照らし合わせは記録と画面の印で共通の `@/foundation/ui/lib/textFind.ts`。
- 探すのは記録から（`chatFindMatches.ts`）。末尾より前の本文はコアの `texts?before=` で読み、正規表現はコアで流さない。
- 印は描いている範囲だけに CSS Custom Highlight API で付ける（DOM を書き換えない）。
