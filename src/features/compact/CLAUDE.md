# 圧縮と、圧縮前・圧縮後の指示（`src/features/compact`）

## 地図

- `core/preCompact.ts`: 圧縮前・圧縮後の指示を送る順と預かり。手で圧縮する実行は `@/features/chat/core/turn.ts`（コメントに決まり）。
- `ui/`: 圧縮前指示・圧縮後指示の設定（`CompactPrompt*`・`useCompactPrompt.ts`）・圧縮中の行・預かった発言の書き直し（`heldEdit.ts`）。種類の名前とアイコンは `COMPACT_PROMPT_KINDS`、保存する項目は `@shared/chat/prompts` の `COMPACT_PROMPT_FIELDS`。

## 決まり

- 圧縮の終わりは null・`compact_boundary`・作業の終わりだけで見る（`requesting` では外さない）。始めた時刻ときっかけは終わるまで変えない。
- 手で圧縮する実行は発言・結果を残さず、回数・未読に数えず、作業中の操作を渡さない。作業中なら予約（`ChatQueue.reserve("compact")`）。
- 圧縮前指示（共通 → プロジェクトの順）は先に 1 回の作業として送り、最後まで終わったら送信待ち・預かりより先に `/compact`（`compactNow`）。止めた・失敗したら圧縮しない。
- 上限に近づいた自動の圧縮では、プロバイダーの PreCompact フックが足す（`ProviderTurnParams.preCompact`）。足したら札付きの発言として記録し、圧縮か消去の記録まで足さない（記録から導く `preCompactSent(marks)`）。
- 圧縮前指示から圧縮のあとのやり取りが終わるまで（`awaitingCompact`・`compactedTurn`）、「いま」は預かる。
- 圧縮後指示は送信待ちに入れない。`compact` の記録を先に書いてから預かりの先頭に入れる。
- 画面に見せる文はコアと同じ `compactPromptFor`。オン / オフは文と別にすぐ保存する（オフでも文は残す）。

## 落とし穴

- 配る順は 圧縮後指示 → 預かった「いま」→ 送信待ち（`Runner.drainAfterCompact`。`deliverAfterCompact` と `deliverHeld` が共通に使う）。圧縮したやり取りの途中は、圧縮後指示でない指示の所で止める。
- 通信の切断・使用枠の上限・アプリの終了で終わったら、圧縮後指示だけ預かりに残し（`parkAfterCompact`）、ほかは送信待ちの先頭へ。
