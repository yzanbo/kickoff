# 通知（`features/notifications`）

完了・失敗・回答待ち・AI からの知らせ・CI の失敗を、見ていない人に Mac の通知とスマホのプッシュで知らせる。受け入れの一覧: `docs/features.md` の `MOB-`。

## 地図
- `core/center.ts`: 知らせるかの判断（1 か所）。届け先 `NoticeSink`（`desktop` = Mac、`push` = devices の `pushSink.ts` が `addSink`）
- `core/viewing.ts`（`PUT /api/viewing`）・`core/notices.ts`（文。形 `Notice` は `@shared/foundation/ipc/notifications`）・`core/tools.ts`（`notify_user`）
- `ui/viewingReport.ts`・`ui/notificationClicks.ts`・`ui/dockBadge.ts`・`ui/native.ts`

## 決まり
- 見ているチャットの通知は出さない（呼び主ごとの「見ているもの」。この Mac で見ていても、見ていない端末には送る）。
- 知らせに秘密を載せない: プッシュの文はチャットの名前と状態だけ（中身・失敗の理由を載せない）。Expo Push にアクセストークンを付けない。
- CI の失敗は `push` に渡さない。`window.kickoff` は `ui/native.ts` だけ。

## 落とし穴
- 1 つの届け先が送れなくても、ほかは止めない。
- テスト: `core/*.test.ts`・`core/routes.test.ts`。
