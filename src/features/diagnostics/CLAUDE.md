# 診断（`src/features/diagnostics`）

## 地図

- 記録: 性能（`desktop/diagnostics.ts`）・詰まり（`@/foundation/desktop/diagnostics/stalls.ts`）・起動の時刻とメモリ（`@/foundation/desktop/diagnostics/bootRecorder.ts`）・設定の「診断」のまとめ（`desktop/logOverview.ts`）。書き先はログの場所（`@/foundation/desktop/app/logs.ts`。保存先はエージェントが読めない）。
- `ui/`: コアの帯 `CoreStatusBand`（文は `@shared/foundation/ipc` の `CORE_STATE_LABELS`）・「いつも取っている記録」の文 `overviewLines.ts`。

## 決まり

- コアの帯は App と別ウィンドウに置く（ブラウザの画面には出さない）。
- 時刻は epoch ms でそろえる。ログを回すのはメインだけ（コアが書き足す前に）。
