# チャットの作業場所を変える（`src/features/workplaceMove`）

## 作業場所を移す（`core/move.ts`）

- 作業場所（本体 / ワークツリー・プロジェクト・作業フォルダ）が変わる道はすべて `workplaceMove.api.move`（chat の `withIdleChat` → `moveChatWorkplace`）を通す。道を足すときも通す。ルートは `core/routes.ts`、フォルダの付け替えは `afterRepoMove`。
- 手順の順は `core/move.ts` の頭。写せないとき、利用者・AI なら移さずに 400、自動の道・写す口がない・会話がないなら写さずに移す。
- 区切りより前の巻き戻し・分岐・ファイルを戻すは断り（`@shared/chat/boundaries`）、起点は区切りで止まる。画像はそのときの作業場所から解く。
- AI への知らせは区切りのあと最初の実行の文脈に添え、知らせたかは保存せず `store.events.pendingWorkplaceMove` で決める。
- 利用者が移す（`core/userMove.ts`）は子チャットを移さず、持っていく変更は `@/foundation/core/workplace/carry.ts`、移せなければ `undo` で戻す。新しいワークツリーは土台の `creator()`、動いているターミナルは terminal が登録する `RunningTerminalsPort`（`core/target.ts`）。
- AI が移す（`core/reserve.ts`。ツール `move_workplace` は `core/aiWorkplace.ts`・組と移動の知らせの contributor は `core/tools.ts`。決まりは `src/features/chat/CLAUDE.md` の「AI の操作ツールの中身」）は予約（`reserveAtTurnEnd`）だけで、最後まで終わった作業の終わりに移す（続きは `placeContinuation`）。取り消しは AI にも伝える（`pendingNote`）。

## 画面（`ui/`）

- 見出しの札 `WorkplaceMoveChip`・予約の行 `WorkplaceMoveRow`・右クリックの `WorkplaceMoveItem` は入口から。札の印と説明の行は作業場所の飾り `workplaceDecor`（PR・実行環境の機能を読まない）。
