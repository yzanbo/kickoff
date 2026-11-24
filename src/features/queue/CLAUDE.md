# 送信待ち（`features/queue`）

送信待ちの一覧と操作、起動したときの再開の確かめ。中身と口は chat の殻（`src/features/chat/core/CLAUDE.md`）。受け入れの一覧: `docs/features.md` の `RUN-`。

## 地図
- `core/routes.ts`: 起動したときの再開の確かめのルート（コアはこれだけ）
- `ui/queueController.ts`: 口 `createQueueController`（`POST …/queue` の `commands`・`…/queue/send`）。`useQueue`・一覧の中は `useQueueActions()`
- `ui/restartResume/`: 一覧と開いているか（`restartResumes.ts`・`restartResumeDialog`）・`RestartResumeHost`。下の帯の札 `footerItems.ts`
- `@shared/chat/queueStops.ts`（止める印）・`QUEUE_ACTION_LOOKS`（挟む行の見た目）

## 決まり
- 状態は `ChatLive.queue`（`QueueState`）。結果は SSE で届く（応答を状態に使わない）。予約はコアの `reserved`（行は compact の `reservedRow`）。
- 一時停止の印は指示に付けず列の位置で持つ（コアの並べ替えと画面の予測が同じ `queueStops.ts`）。
- 並べ替え・線は応答を待たず `applyQueueCommand` で重ねて出し（`queueViewOf`）、コアの並びが変わった・送れなかった・3 秒たったら戻す。
- 送信待ちから送った指示は `QueueState.sending` を「送信中…」で出す（画面で導かない）。
- 挟む行（圧縮・消去）の見た目は `QUEUE_ACTION_LOOKS` 1 か所。`/clear` は送らずコアが消去にする（`isClearCommand`）。

## 落とし穴
- 起動したときは、決めるまでコアが続けず送らない。ダイアログはメインのウィンドウだけで、コアを作り直したあとに止まったチャットでも開く（`autoOpenRestartResumes`）。
- 書き直している間は composer の `useEditHold` で知らせ直す（落ちたら持ち時間で外れて送る）。一覧をたたんだら書きかけを捨てる（`discardAll`）。
- 線は保つ: 次の線は先回りした並びから作る。
- テスト: `core/routes.test.ts`・`ui/*.test.ts`・`@shared/chat/queueStops.test.ts`。
