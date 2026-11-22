# グループ（`src/features/groups`）

- ほかの機能は `core/index.ts` だけを読む（`requireGroupOf`: チャットを入れるグループがあり、同じプロジェクトのものか）。
- ルートは取り決め `@shared/groups/contract.ts` と受け口 `core/routes.ts`。消すときは中のチャットをグループなしに戻してから `group_deleted` を知らせる（`core/db/groups.ts`）。

## グループの共通部分（`ui/`）

- 名前を聞く・削除を確かめるのは `groupDialogs.ts`。グループへのドラッグ（`useGroupDrop`）は chatList。
- 「No Group」の位置は全プロジェクトのボードと同じ設定。分けるのは `splitAtUngrouped`（もとの並びの中の位置で分ける）。
