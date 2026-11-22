# グループ（`src/features/groups`）

- ほかの機能は `core/index.ts` だけを読む（`requireGroupOf`: チャットを入れるグループがあり、同じプロジェクトのものか）。
- ルートは取り決め `@shared/groups/contract.ts` と受け口 `core/routes.ts`。消すときは中のチャットをグループなしに戻してから `group_deleted` を知らせる（`core/db/groups.ts`）。

## グループの共通部分（`ui/`）

- `useReorder`・`useGroupDrop`・`startChatDrag` / `startDraftDrag` はサイドバー・全プロジェクトのボード・タブのまとまりで共通。
- ドラッグの絵は `startDragGhost` を通し、動かしている物を薄くする state はその `after` で変える。
- 「No Group」の位置は全プロジェクトのボードと同じ設定。分けるのは `splitAtUngrouped`（もとの並びの中の位置で分ける）。
