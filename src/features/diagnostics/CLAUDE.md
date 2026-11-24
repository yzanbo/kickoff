# 診断（`features/diagnostics`）

性能・詰まり・起動の記録と、設定の「診断」のまとめ・コアの帯。

## 地図

- 記録: 性能（`desktop/diagnostics.ts`。プロセスごとの分は `@/foundation/core/diagnostics/processRecording.ts` をメインとコアが取る）・詰まり（`@/foundation/desktop/diagnostics/stalls.ts`）・起動の時刻とメモリ（`@/foundation/desktop/diagnostics/bootRecorder.ts`・`bootTimeline.ts`）・設定の「診断」のまとめ（`desktop/logOverview.ts`）。書き先はログの場所（`@/foundation/desktop/app/logs.ts`。保存先はエージェントが読めない）。
- メインの部品は `desktop/index.ts` の `diagnosticsDesktop`（IPC・メニューの「ヘルプ」・コアの分の記録）。
- `ui/`: コアの帯 `CoreStatusBand`（文は `@shared/foundation/ipc` の `CORE_STATE_LABELS`）・「いつも取っている記録」の文 `overviewLines.ts`。`window.kickoff` は `ui/native.ts` だけ。

## 決まり

- コアの帯は App と別ウィンドウに置く（ブラウザの画面には出さない）。
- 時刻は epoch ms でそろえる。ログを回すのはメインだけ（コアが書き足す前に）。
- 画面で数えるクラス名（`desktop/profileSummary.ts` の `RENDERER_PROBE`）は、部品の名前を変えたら直す（`profileSummary.test.ts` が確かめる）。
- テスト: `desktop/*.test.ts`・`ui/overviewLines.test.ts`。
