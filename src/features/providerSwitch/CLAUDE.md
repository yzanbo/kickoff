# AI を替えて会話を続ける（`features/providerSwitch`）

チャットの AI を替え、会話と Git の状態の資料を添えて続ける。受け入れの一覧: `docs/features.md` の `RUN-`。

## 地図
- `core/providerSwitch*.ts`: `prepareAndCommitProviderSwitch`（準備してまとめて書く）・`core/routes.ts`
- `core/providerHandoffs.ts`: 表 `chat_provider_handoffs`・`chat_provider_sessions` の店（chat には `ProviderHandoffPort`）。トランザクション 4 つは `core/store.ts`
- `core/db/handoffs.ts`: 替え直してよいか `handoffBlocksSwitch`。`core/turn.ts`: 実行に足す contributor
- `ui/api.ts`（`providerSwitchApi`）・札 `ProviderSwitchChip`・知らせ `ProviderHandoffNotice`

## 決まり
- 準備と確定は chat の `ProviderSwitchPort`、段取りは `withIdleChat`。確定は確認のハッシュが同じときだけ。準備中に作業・会話・送信待ちが変わったら保存せず、作った長文ファイルを片付ける。
- 替え直してよいかは `handoffBlocksSwitch` 1 つ（確認・`switchProvider`・`commit` が使う）。
- 引き継ぎの印を取るのは命令の実行（読むだけの判定で取らない）。動かす直前に `sending` と書き、DB のトランザクションと対にする。
- 送ったあとの失敗・中断・起動時の `sending` は受信不明にし、利用者が確かめるまで送り直さない（`confirmResendProviderHandoff`）。
- 替えられる AI は `SWITCHABLE_PROVIDERS`（名前で書かない）。札は権限モード・送信待ち・作業中の子チャット・巻き戻せなくなることを確かめてから替える。

## 落とし穴
- chat の表は chat の店の操作（`chats.write`・`events.write`・`patchData`）で書く。会話記録の片付けには `rememberedSessions` で覚えを渡す。
- 区切り `provider_switched` をまたぐ巻き戻し・分岐・ファイルを戻すはコアで断り、画面でも止める。セッションの消失は確かめ済みの厳密なエラーだけで認める。
- 集める前の失敗も `afterTurn` で戻す。知らせは `ChatLive.provider_handoff` が止まっている間だけ理由を読む（見張りで取りに行かない）。
- テスト: `core/*.test.ts`・`core/routes.test.ts`・`core/prompts.snapshot.test.ts`。
