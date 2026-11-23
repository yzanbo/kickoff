# 通知（`src/features/notifications`）

## 通知（`core/`）

- 完了・失敗・回答待ち・AI からの知らせ・CI の失敗を、見ていない人にだけ知らせる判断はコアの 1 か所（`core/center.ts`）。届け先は `NoticeSink`（`desktop` = Mac の通知はコアの起動の値 `notify`、`push` = スマホのプッシュは devices の `pushSink.ts` が `addSink` で足す）。CI の失敗は `push` に渡さない。
- 見ているかは呼び主ごとの `PUT /api/viewing`（取り決め `@shared/notifications/contract.ts`。見るだけの端末も使う。`core/viewing.ts`）。この Mac で見ていても、見ていない端末には送る。
- AI からの知らせ（ツール `notify_user`）は `core/tools.ts` の組（`CoreFeature.aiTools`。AI のツールの決まりは `src/features/chat/CLAUDE.md` の「AI の操作ツールの中身」）。
- 文は純粋な `core/notices.ts`（形 `Notice` はメインも読むので `@shared/foundation/ipc/notifications`）。プッシュの文はチャットの名前と状態だけ（中身・失敗の理由を載せない）。Expo Push（`@/features/devices/core/push.ts`）はアクセストークンを付けない。1 つが送れなくても、ほかは止めない。
- 画面: 見ているものの知らせ `ui/viewingReport.ts`・押したときに開く `ui/notificationClicks.ts`・Dock の数 `ui/dockBadge.ts`。`window.kickoff` は `ui/native.ts` だけ。
