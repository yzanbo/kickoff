# AI を替えて会話を続ける（`src/features/providerSwitch`）

## AI の切り替え（`core/providerSwitch*.ts`・`core/providerHandoff*.ts`）

- `prepareAndCommitProviderSwitch` が会話と Git の状態を準備してまとめて書く。準備中に作業・会話・送信待ちが変わったら保存せず、作った長文ファイルを片付ける。
- 替え直してよいかは `@/features/chat/core/db/chatProviderHandoffs.ts` の `handoffBlocksSwitch` 1 つ（確認の中身・`Runner.switchProvider`・`store.providerSwitch.commit` が使う）。確定は確認のハッシュが同じときだけ。
- 実行に足すもの（資料・送信中の印・作業の終わりの後始末）は `core/turn.ts` の contributor（集める前の失敗も `afterTurn` で戻す）。引き継ぎは動かす直前に `sending` と書く。送ったあとの失敗・中断・起動時の `sending` は受信不明にし、利用者が確かめるまで送り直さない（`confirmResendProviderHandoff`）。
- セッションの消失は確かめ済みの厳密なエラーだけで認める。区切り `provider_switched` をまたぐ巻き戻し・分岐・ファイルを戻すはコアで断る。画面でもコアと同じく止める。
