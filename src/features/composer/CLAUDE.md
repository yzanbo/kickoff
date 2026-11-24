# 入力欄（`features/composer`）

チャット欄（書く欄・送り方・ピル・下の行）。選択は `src/features/ai/CLAUDE.md`、添付は `src/features/attachments/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `CHT-`。

## 地図
- `ui/ChatComposerArea`: 上から 流れ → 作業中の知らせ → ピル → 定型文の帯 → 送信待ち → 入力欄
- `ui/Composer`（props 10。送る口 `ComposerSend`・送れるか `composerModel`）・書く欄 `MessageField`（キーの順は `messageFieldModel`）
- `ui/useChatSend`（`createChatSend` が `when`・`hold`・`pause_after` を決める）・`sendModeOf`・`useEditHold`
- 下書きの店 `chatComposerDraft`（新しいチャットは `newChatDrafts.ts`）・`appendToDraft`・`focusComposer`
- 差し込み `composerSlots`（帯・右クリック・メーター・ピル・音声。`load` で渡し `loadComposerSlots` が描く前に読む）

## 決まり
- 送り方は `useChatSend` 1 本。出どころ `handoff_from` は入力欄から送るもの（`submit`・`ask`）だけで、定型文の「すぐ送る」は `sendOther`。
- 作業中の扱いは `composer:queue-mode`（`now` = いま / `later` = あとで）と ⌘Enter / ⌘⇧Enter。作業していなくて送信待ちが残るときは「すぐ送る / ためておく」。
- 「質問として送る」は同じ送り方で `pause_after` を付ける。送る前の確かめでやめたら `SendCancelled`（失敗を出さない）。
- ピルの一覧は開いているときだけ呼ぶ関数で渡し、言葉は `ChipWord`・`.chip-detail`・`.chip-short-icon` の形（狭い所でアイコンと数だけ）。
- 選択は `useChatOptions`。モデルに合わない選択は描くときに `fitChatOptions` で外す。Fast は対応が分からない間、希望を消さず実行にも渡さない。
- 添付は選んだ時点でアップロードし、送るか外すまで残す（`mergeAttachments` で入れ替え、札は `AttachmentChip`）。ほかのチャットを読ませるのは「参照」。
- 高さは CSS（`field-sizing: content`）で伸ばす。コンパクトは `compact` のクラスで、送信待ち・ピルの列にも付ける。

## 落とし穴
- 変換中の Enter は送らない（IME）。Esc は 2 回で中断（パネルを閉じるのにも使う）。録音中・候補の一覧で先に扱ったキーは見ない。
- 「いま」が伝えられない・圧縮を待つ間はコアが預かり、作業の終わりに送信待ちより先に送る。圧縮後指示は送信待ちに入らない（書き直しは `@/features/compact/ui/HeldEditComposer.tsx`）。
- 書き直している間は `useEditHold` で `PUT …/queue/editing` を知らせ直す。保存の前に送られたら、書いた文をふつうのチャット欄に移す。
- 会話の圧縮中は停止のボタンを出さない（止めるのは Esc 2 回）。
- ピル・送信待ちを外の描く先（`ChatHost.chipsPortal`・`queueTarget`）に描くときは、会話へ移る前に `reveal` で画面を見せる。
- 下の行は 1 行に収める（`useComposerBarFit`）。決め打ちの幅で切り替えず測り、中身の幅が変わる値が変わったら測り直す。
- 入力欄がなくなってから終わったアップロードも残す先へ足す。
- テスト: `ui/*.test.ts`（`composerModel`・`messageFieldModel`・`createChatSend`）。
