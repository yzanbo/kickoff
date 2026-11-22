# AI を替えて会話を続ける（`src/features/providerSwitch`）

## AI の切り替え（`core/providerSwitch*.ts`・`core/providerHandoff*.ts`）

- `prepareAndCommitProviderSwitch` が会話と Git の状態を準備してまとめて書く。準備中に作業・会話・送信待ちが変わったら保存せず、作った長文ファイルを片付ける。
- ルートは `core/routes.ts`。準備と確定は chat の `ProviderSwitchPort` に登録し、段取り（作業中か・送信待ちの形の確かめ）は chat の殻の `withIdleChat`。
- 替え直してよいかは `core/db/handoffs.ts` の `handoffBlocksSwitch` 1 つ（確認の中身・`switchProvider`・`store.providerSwitch.commit` が使う）。確定は確認のハッシュが同じときだけ。
- 実行に足すもの（資料・送信中の印・作業の終わりの後始末）は `core/turn.ts` の contributor（集める前の失敗も `afterTurn` で戻す）。引き継ぎは動かす直前に `sending` と書く。行き先は `handoffAfterTurn`。送ったあとの失敗・中断・起動時の `sending` は受信不明にし、利用者が確かめるまで送り直さない（`confirmResendProviderHandoff`）。
- 表 `chat_provider_handoffs`・`chat_provider_sessions` の店は `core/providerHandoffs.ts`（組み立てが chat の前に作り、chat には `ProviderHandoffPort` で渡す）。4 つのトランザクションは `core/store.ts`（chat の表は chat の店の操作 `chats.write`・`events.write`・`patchData` で書く）。chat の会話記録の片付けには `rememberedSessions` で覚えを渡す。
- セッションの消失は確かめ済みの厳密なエラーだけで認める。区切り `provider_switched` をまたぐ巻き戻し・分岐・ファイルを戻すはコアで断る。画面でもコアと同じく止める。

## 画面（`ui/`）

- 呼ぶ口は `ui/api.ts` の `providerSwitchApi`（`client(providerSwitchContract)`）。替えられる AI は `@shared/ai/providers` の `SWITCHABLE_PROVIDERS`（表の `switch`。名前で書かない）。
- チャット欄の札 `ProviderSwitchChip` は、権限モード・送信待ち・作業中の子チャット・巻き戻せなくなることを確かめてから替える。新しいチャットの AI を選ぶ札は ai の `ProviderPicker`。
- 引き継ぎの知らせ `ProviderHandoffNotice` は `ChatLive.provider_handoff` が止まっている（`blocked`・`uncertain`）間だけ理由を読む（見張りで取りに行かない）。
