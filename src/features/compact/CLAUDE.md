# 圧縮と、圧縮前・圧縮後の指示（`features/compact`）

会話の圧縮（手で圧縮する・自動の圧縮）と、その前後に足す指示・右下のメーター。

## 地図

- `core/routes.ts`: 手で圧縮する・消去（預かった指示を外す・書き直すのは送信待ちの命令。取り決めは `@shared/compact/contract.ts`。段取りは chat の殻）。
- `core/preCompact.ts`: 自動の圧縮の前に足す圧縮前指示の contributor（`createCompact` が登録）。指示の文は `compactPromptFor`。手で圧縮する実行は `@/features/chat/core/run/turn/execute.ts`（コメントに決まり）。
- `ui/`: 圧縮前指示・圧縮後指示の設定（`CompactPrompt*`・`useCompactPrompt.ts`）・圧縮中の行・預かった発言の書き直し（`heldEdit.ts`）・右下のメーター。種類の名前とアイコンは `COMPACT_PROMPT_KINDS`、保存する項目は `@shared/chat/prompts` の `COMPACT_PROMPT_FIELDS`。
- メーター（`ContextMeter.tsx`）は composer の差し込み `meter` に登録し、チャットと圧縮の様子は自分で読む。圧縮まわりの `ChatLive` の読み方（`compactingLabel`・`reservedRow`・`compactsAfterTurn`）は `compactHold.ts`、預かった指示の文は `afterCompactLabel.ts`。

## 決まり

- 圧縮の終わりは null・`compact_boundary`・作業の終わりだけで見る（`requesting` では外さない）。始めた時刻ときっかけは終わるまで変えない。
- 手で圧縮する実行は発言・結果を残さず、回数・未読に数えず、作業中の操作を渡さない。作業中なら予約（`@shared/chat/outbox` の `reserve`）。
- 圧縮前指示（共通 → プロジェクトの順）は先に 1 回の作業として送り、最後まで終わってまだ圧縮していなければ送信待ち・預かりより先に `/compact`（`turnEnd.ts`）。止めた・失敗したら圧縮しない。
- 上限に近づいた自動の圧縮では、プロバイダーの PreCompact フックが足す（`ProviderTurnParams.preCompact`）。足したら札付きの発言として記録し、圧縮か消去の記録まで足さない（記録から導く `preCompactSent(marks)`）。
- 圧縮前指示から圧縮のあとのやり取りが終わるまで（`compaction` の `awaiting`・`done`）、「いま」は預かる。
- 圧縮後指示は送信待ちに入れない。`compact` の記録を先に書いてから預かりの先頭に入れる。
- 画面に見せる文はコアと同じ `compactPromptFor`。オン / オフは文と別にすぐ保存する（オフでも文は残す）。

## 落とし穴

- 配る順は 圧縮後指示 → 預かった「いま」→ 送信待ち（`@/features/chat/core/run/machine/outbox.ts` の `pumpNow`・`deliverNow`）。圧縮したやり取りの途中は、圧縮後指示でない指示の所で止める。
- 通信の切断・使用枠の上限・アプリの終了で終わったら、圧縮後指示だけ預かりに残し（`parkNow`）、ほかは送信待ちの先頭へ。
- テスト: `core/prompts.snapshot.test.ts`・`ui/*.test.ts`。
