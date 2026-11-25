# 会話の画面（`features/conversation`）

1 つのチャットの画面・流れ・発言・ツールの行・作業中の様子・動き・承認・検索（パスは `ui/` から）。チャットの店は `src/features/chat/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `CHT-`。

## 地図
- `screen/`: `ChatScreen` → 殻 `ChatShell` → 会話の欄 `ChatColumn`・画面の口 `createScreenActions`。見出しと「表示」は `display/`、キーは `chatHotkeys.ts`（⌘⇧U は `useReadToggleKey`）
- `timeline/`・`streaming/`: 項目 `ui/timelineItems.ts`・種類の表 `rowKinds.tsx`・窓 `useTimelineWindow`・付いていき `useFollowBottom`・書いている途中 `StreamingReply`
- `messages/`（引用 `quotable.ts`）・`tools/`（`toolText`・`toolRowViewOf`・出力の店 `commandOutputs.ts`）
- `working/`・`background/`・`todo/`・`activity/`・`approvals/`・`promptList/`・`find/`・`rewind/`（失敗の直す操作 `failedTurnOf`）

## 決まり
- チャットの画面は `ChatScreen` 1 つ。置き場所の違いは `ChatHost` で受ける。店はチャットごとに 1 つ（何か所で開いても読み込みと SSE は 1 回）。
- 部品は要る口だけを `useSyncExternalStore` で読む。記録から作るものは持ち主の `defineChatSelector` で読み、記録の配列・流れ全体に効く値を項目の props で渡さない（作業中かは `TimelineBusyContext`）。
- 書いている途中の文は state・props に入れず店の口から読む（見えていない間は rAF を回さない）。
- 操作は持ち主ごとの口（`TimelineNav` など）で配る。props で中継しない・DOM を探さない。移る処理は `TimelineNav.reveal(ID)` を待ってから。
- 行の文は `toolText()`（生の JSON を出さない）。上の機能の行の見せ方は拡張点 `toolRowViews`、メッセージの操作は `messageActions`。
- 選択部分は「追加」（「添付」はファイル全体だけ）。引用は下書きの後ろに足す `appendToDraft`（送るのは利用者）。
- 見出しはドラッグ領域にしない。会話の文字は `calc(… * var(--chat-scale, 1))`。
- 承認カードの SQL・依頼は全文出す。質問は 1 問ずつで、たたんでも欄を作り直さない。

## 落とし穴
- `ChatScreen` と殻は記録を読まない（隠れている間も殻ごと描き直す）。`ChatColumn` は `Activity` の hidden で止める（ノートのチャット・別ウィンドウは止めない）。
- 項目は 1 つずつ `.timeline-row`（`content-visibility` の単位）。窓の外は測った高さか見積もりの箱。選んでいる・ピントのある・書く欄のある行は外さない。
- 読み足しは読んだ範囲の始まりの手前で始める（端だと慣性が止まる）。読んでいた位置はスクロールアンカーに任せ、scrollTop 0 で前に増えたときだけ直す。
- 付いていきは大きさの知らせで行う（`scrollHeight` を毎フレーム読まない）。上へ戻す操作は先に付いていきをやめる（`holdUp`）。
- 途中の文を消すときは知らせずに世代を進め、記録の差し替えで `streamGen` を進める（確定と消えを 1 回の描き直しに）。
- 書きかけで補う印・HTML のタグは表示と同じ判定（`cjkFlanking`・`htmlAllowlist`）。
- 動いているかは最後に届いた時刻（`stall.ts`）。中断は裏の作業も止まると確かめてから。
- ToDo はセッションが替わると番号が振り直るので、それまでの分を締める。指示の一覧は `promptListOf` 1 回で作る。
- 検索の印は描いている範囲だけに CSS Custom Highlight API で付ける（DOM を書き換えない）。正規表現はコアで流さない。
- 区切りより前の行は `PastWorkplace`（そのときの作業場所から開く・書き直しを止める）。
- テスト: `ui/**/*.test.ts`（索引＋末尾は `ui/timeline/chatLogDigest.test.ts`）。
