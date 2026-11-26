# 作業場所を移す（`features/workplaceMove`）

チャットの作業場所（本体 / ワークツリー・プロジェクト・作業フォルダ）を変える。受け入れの一覧: `docs/features.md` の `RUN-`。

## 地図
- `core/move.ts`: `moveChatWorkplace`（手順の順は頭のコメント）・`core/routes.ts`・付け替え `afterRepoMove`
- `core/userMove.ts`（利用者が移す）・`core/reserve.ts`（AI が移す予約）・`core/aiWorkplace.ts`（`move_workplace`）・`core/tools.ts`（組と知らせの contributor）・`core/target.ts`（`RunningTerminalsPort`）
- `ui/`: 札 `WorkplaceMoveChip`・予約の行 `WorkplaceMoveRow`・右クリック `WorkplaceMoveItem`

## 決まり
- 作業場所が変わる道はすべて `workplaceMove.api.move`（`withIdleChat` → `moveChatWorkplace`）を通す。道を足すときも通す（ほかのプロジェクトへ: 右クリックの「プロジェクトを移動」・ノートを欄の間で動かす notes の `noteTransfer.ts`）。
- 区切りより前へは戻れない: 巻き戻し・分岐・ファイルを戻すは断り（`@shared/chat/boundaries`）、起点は区切りで止まる。画像はそのときの作業場所から解く。
- 移したあと最初の実行にだけ知らせを添える（知らせたかは保存せず `store.events.pendingWorkplaceMove` で決める）。
- AI の移動は予約（`reserveAtTurnEnd`）だけで、作業が最後まで終わってから移す（続きは `placeContinuation`）。取り消しは AI にも伝える。
- AI の `move_workplace` の `project` はほかのプロジェクト・共通へ移す予約（`/move` と同じく子チャットごと・`to: main` だけ・いちばん上の親チャットだけ）。共通のチャットから利用者のプロジェクトへは設定「共通のチャットがほかのプロジェクトに書くとき」に従って聞き、プロジェクトのチャットからは聞かない。
- 共通のチャットは作業場所を移せない（`workplaceMoveBlocked`。利用者が移すのは 409。作業フォルダが Git の中でも）。Git の作業場所を持つかはワークツリーの一覧と同じ `hasGitWorkplace`（projects）。画面の移す先は一覧が空なら出ない。プロジェクトと共通の間は `/move` で、ワークツリー・グループは外れる（ワークツリーは残す）。
- 利用者が移すときは子チャットを移さない。持っていく変更は `@/foundation/core/workplace/carry.ts`、移せなければ `undo` で戻す。

## 落とし穴
- 写せないとき、利用者・AI なら移さずに 400、自動の道・写す口がない・会話がないなら写さずに移す。
- 札の印と説明は作業場所の飾り `workplaceDecor`（PR・実行環境の機能を読まない）。
- テスト: `core/routes.test.ts`・`core/prompts.snapshot.test.ts`・`src/app/core/scenarios/workplaceReservation.test.ts`。
