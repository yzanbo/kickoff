# 利用者が見ているもの（`features/userView`）

AI の `get_user_view` が読む、この Mac の画面のウィンドウごとの「見えているペインごとの前のタブ・右の欄・選んでいる範囲」と、発言を送った時点の同じ様子。

## 地図

- `core/`: 覚える `registry.ts`（保存しない）・AI に返す文 `format.ts`・ツール `tools.ts`・受け口 `routes/userView.ts`（取り決め `@shared/userView/contract.ts`）・zod の形 `schemas.ts`。
- `ui/`: 集める `collect.ts`・知らせる `report.ts`（送る指示にも `setSendExtras` で添える）・タブの説明の拡張点 `points.ts` の `userViewTabs`・部品だけが知る中身の置き場 `viewDetails.ts`。

## 決まり

- タブの種類の説明は持ち主が `userViewTabs.item(describeTab(kind, describe))` で出す（files・git・notes・browser・terminal）。チャットのタブと projectView の説明は userView の `contributes.ts`（持ち主が userView を読むと循環になる）。
- プロジェクトの画面（DB・GitHub）の中身は、持ち主が土台の `viewDescribers` に出す。
- 送った時点の様子を覚えるのは、この Mac の画面から送ったときだけ（端末からは覚えない）。口は端末に開かない。
- ほかのプロジェクトを見ているときは、中身を AI に返さない。
- テスト: `core/routes.test.ts`・`core/userView.test.ts`・`ui/viewDetails.test.ts`。
