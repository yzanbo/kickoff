# 送信待ち（`src/features/queue`）

- コアは起動したときの再開の確かめのルート（`core/routes.ts`）だけ。送信待ちの中身と 1 件ごとの口は chat の殻（`src/features/chat/CLAUDE.md` の「送信待ち」）。

## 送信待ち（`ui/`）

- 状態は `ChatLive.queue`（`QueueState`）。操作は口 `createQueueController`（`ui/queueController.ts`。取り決めの `POST …/queue` の `commands`・`…/queue/send`）を `useQueue` で持ち、一覧の中の部品は `useQueueActions()` で読む。予約はコアの `reserved`（`reservedRow`）。
- 起動したときの再開（`ChatLive.restart_resume`）は、決めるまでコアが続けず送らない。一覧は `ui/restartResume/restartResumes.ts`、ダイアログはメインのウィンドウだけ。コアのプロセスを作り直したあとに止まったチャットでも開く（`autoOpenRestartResumes`）。
- 一時停止の印は指示に付けず、列の位置で持つ。純粋関数は `@shared/chat/queueStops.ts`（コアの並べ替えと画面の予測で共有）。
- 並べ替え・印の線は応答を待たずに `applyQueueCommand` で重ねて出し（`queueViewOf`）、応答のあとコアの並びが変わった・送れなかった・3 秒たったら戻す。次の線は先回りした並びから作る。
- 送った指示は、流れか預かりの吹き出しに出るまで「送信中…」で残す（`useQueue`。コアは送信待ちから外してから発言を記録する）。消す命令は口が先に覚え（応答より先に知らせが届く）、消したものは「送信中」にしない。
- 書き直している間は composer の `useEditHold` で `PUT …/queue/editing` を知らせ直す（落ちたら持ち時間で外れて送る）。一覧をたたんだら書きかけを捨てる（`discardAll`）。
- `/clear`（`isClearCommand`）は Claude Code に送らず、コアがコンテキストの消去にする。候補の説明は `CLEAR_COMMAND_DESCRIPTION`。
- 挟む行（圧縮・消去）のアイコン・色・文言は `QUEUE_ACTION_LOOKS` 1 か所。ドラッグの絵はアプリ共通の `@/foundation/ui/kit/dragGhost.ts`。
