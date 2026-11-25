# 通知（`features/notifications`）

完了・失敗・回答待ち・AI からの知らせ・CI の失敗を、見ていない人に Mac の通知とスマホのプッシュで知らせる。作業中・未読・回答待ちの数を Dock のアイコンの隅に出す。受け入れの一覧: `docs/features.md` の `MOB-`。

## 地図
- `core/center.ts`: 知らせるかの判断（1 か所）。届け先 `NoticeSink`（`desktop` = Mac、`push` = devices の `pushSink.ts` が `addSink`）
- `core/viewing.ts`（`PUT /api/viewing`）・`core/notices.ts`（文。形 `Notice` は `@shared/foundation/ipc/notifications`）・`core/tools.ts`（`notify_user`）
- `ui/viewingReport.ts`・`ui/notificationClicks.ts`・`ui/native.ts`
- Dock のアイコン: 集計対象 `ui/dockBadge.ts`（数え方はチャットの `stateCounts`）・丸の位置と色 `ui/dockIconModel.ts`・更新順 `ui/dockIconUpdater.ts`・描画 `ui/dockIcon.ts`（canvas で描いた PNG をメインの `foundation/desktop/app/dockIcon.ts` が当てる）
- 状態と角・IPC の対応は `@shared/notifications/stateBadges`。画面は `ui/stateBadgeModel.ts` で色と件数を整える。
- Pinstage: `desktop/index.ts` はメインのウィンドウから届いた状態をバッジに変換する。`desktop/pinstageBadges.ts` は変換済みのバッジの更新順と終了を制御し、`desktop/pinstageBadgeFile.ts` がファイルを置き換える。受け入れは `docs/features.md` の `SET-028`。

## 決まり
- 見ているチャットの通知は出さない（呼び主ごとの「見ているもの」。この Mac で見ていても、見ていない端末には送る）。
- 知らせに秘密を載せない: プッシュの文はチャットの名前と状態だけ（中身・失敗の理由を載せない）。Expo Push にアクセストークンを付けない。
- CI の失敗は `push` に渡さない。`window.kickoff` は `ui/native.ts` だけ。
- Dock の丸の色は画面の状態の点（`--dot-*`）をその場で読む（色を決め打ちしない）。macOS の標準の赤い数字（`setBadgeCount`）は使わない（隅を 3 つ使うため）。
- Pinstage には macOS 製品版だけで、集計済みの件数と表示用の情報を渡す（チャットの情報は渡さない）。既存の Dock 設定がオフ・読み込み中、または集計元が消えたときは空配列。Dock の描画に失敗しても、件数は独立して送る。

## 落とし穴
- 1 つの届け先が送れなくても、ほかは止めない。
- Dock のアイコンは、画面が描き直さずに消える（閉じる・読み込み直す・落ちる）とメインが元に戻す。描くのは数・テーマが変わったときだけ（描いている間に変わったら古い絵を当てない）。
- Pinstage の書き出しに失敗したら最新の内容だけ再試行する。終了をやめたら書き出しを続け、終了が決まったときだけ書き込みを止めて最後に JSON を消す。
- テスト: `core/*.test.ts`・`core/routes.test.ts`・`ui/*.test.ts`・`desktop/*.test.ts`。
