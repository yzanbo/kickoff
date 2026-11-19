# 送信待ち（`src/features/queue`）

## 送信待ち（`ui/`）

- 状態は `ChatLive.queue`（`QueueState`）。変える API の応答も同じ形で、受けたら丸ごと置き換える。
- 起動したときの再開（`ChatLive.restart_resume`）は、決めるまでコアが続けず送らない。一覧は `ui/restartResume/restartResumes.ts`、ダイアログはメインのウィンドウだけ。コアのプロセスを作り直したあとに止まったチャットでも開く（`autoOpenRestartResumes`）。
- 一時停止の印は指示に付けず、列の位置で持つ。純粋関数は `@shared/chat/queueStops.ts`（コアの並べ替えと画面の予測で共有）。
- 落としたら応答を待たずに落とした形を出し（`useQueuePrediction`）、サーバーの並びが変わった・送れなかった・3 秒たったら戻す。
- 送った指示は、流れか預かりの吹き出しに出るまで「送信中…」で残す（`useSendingQueued`。コアは送信待ちから外してから発言を記録する）。
- 送信待ちを消す API は、呼ぶ前に `ui/api/queueRemovals.ts` の `noteQueuedRemoved` で覚える（応答より先に送信待ちの知らせが届く）。消したものは「送信中」にしない。
- 次に送る指示を書き直している間は `api.setQueueEditing` を `EDIT_HOLD_TTL_MS` の 1/4 ごとに知らせ直す（落ちたら持ち時間で外れて送る）。一覧をたたんだら書きかけを捨てる（`discardAll`）。
- `/clear`（`isClearCommand`）は Claude Code に送らず、コアがコンテキストの消去にする。候補の説明は `CLEAR_COMMAND_DESCRIPTION`。
- 挟む行（圧縮・消去）のアイコン・色・文言は `QUEUE_ACTION_LOOKS` 1 か所。ドラッグの絵はアプリ共通の `@/foundation/ui/kit/dragGhost.ts`。
