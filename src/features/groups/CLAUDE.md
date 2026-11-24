# グループ（`features/groups`）

利用者が作るチャットのグループ（表 `chat_groups`）。受け入れの一覧: `docs/features.md` の `LST-`。

## 地図
- `@shared/groups/contract.ts`・`core/routes.ts`・`core/db/groups.ts`・`core/index.ts`（`requireGroupOf`）
- `ui/groupDialogs.ts`（名前を聞く・削除を確かめる）・`splitAtUngrouped`・projects の口 `projectGroups`（`ui/projectsPort.ts`）。グループへのドラッグ（`useGroupDrop`）は chatList

## 決まり
- ほかの機能は `core/index.ts` だけを読む。チャットを入れるグループは同じプロジェクトのもの（`requireGroupOf`）。
- 子チャットはグループに入らない（HTTP と AI のツールで同じ確かめ）。
- 「No Group」の位置は全プロジェクトのボードと同じ設定。

## 落とし穴
- 消すときは中のチャットをグループなしに戻してから `group_deleted` を知らせる。
- テスト: `core/routes.test.ts`。
