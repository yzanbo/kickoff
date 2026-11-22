# 入力欄（`src/features/composer`）

## チャット欄（`ui/`。選択は `@/features/ai/`、添付は `@/features/attachments/`）

- 並びは上から、流れ → 同じ作業場所で作業中のチャットの知らせ → ピル → 定型文の帯 → 送信待ち → 入力欄（`ChatComposerArea`）。
- 送り方は `useChatSend` 1 本（`createChatSend` が送る口の `when`・`hold`・`pause_after` を決める）。出どころ `handoff_from` は入力欄から送るもの（`submit`・`ask`）だけで、定型文の「すぐ送る」は `sendOther`。
- ピル（`ComposerChip`）の一覧は、開いているときだけ呼ぶ関数（`children: () => ReactNode`）で渡す。言葉は `ChipWord`・`.chip-detail`・`.chip-short-icon` の形にする（狭い所でアイコンと数だけにする）。
- ピルの列・送信待ちを外の描く先（`ChatHost.chipsPortal`・`queueTarget`）に描くときは、会話へ移る操作の前に `reveal` で画面を見せる。
- 書きかけと添付は下書きの店（`chatComposerDraft`）。外から足すのは `appendToDraft`、ピントは `focusComposer`。
- 文を書く欄は `MessageField`（4 つの欄で共通。キーの順は `messageFieldModel`）。音声は差し込み `composerSlots` の `voice`（hooks）で、マイク・失敗の文は呼ぶ側が置く。
- `Composer` の props は 10（送る口 `ComposerSend`・送れるか `composerModel`）。
- 帯・右クリックの項目・メーター・ピルも差し込み（`load` で渡し、`loadComposerSlots` が描く前に読む）。出さないものは `place.slots`。
- 高さは CSS（`field-sizing: content`）で伸ばす。コンパクトは `compact` のクラスで、送信待ち・ピルの列にも付ける（兄弟かでは見分けない）。
- 下の行は 1 行に収める（`useComposerBarFit`）。決め打ちの幅で切り替えず実際に測り、中身の幅が変わる値が変わったら測り直す。
- Esc は 2 回で中断（パネルを閉じるのにも使う）。録音中・候補の一覧で先に扱ったキーは見ない。
- 選択は `useChatOptions`（4 つ目の引数がチャットの AI）。一覧にないモデルは見せるときだけ既定にする（`fallbackModel`。送る値は直さない）。Fast は対応が分からない間、保存した希望を消さず実行にも渡さない。
- 添付は選んだ時点でアップロードし、送るか外すまで残す（下書きの店・タブの `draftAttachments`）。入力欄がなくなってから終わったアップロードも残す先へ足す。
- 添付は `mergeAttachments` で同じものを入れ替える。札は `AttachmentChip` 1 つ。
- ほかのチャットを読ませるのは「参照」（`ChatContextButton`）。

### 作業中の送り方（いま / あとで）

- 作業中の扱いは `composer:queue-mode`（コアの `when` と同じ `now` = いま / `later` = あとで）とキー（⌘Enter / ⌘⇧Enter。`sendModeOf`）。作業していなくて送信待ちが残るときは「すぐ送る / ためておく」にする（`send.holdsQueue`）。
- 「いま」は `when: now`。伝えられないとき（`tells_closed`）と圧縮を待つ間（`awaiting_compact`・`compacting`・`compacted_turn`）はコアが預かり（`after_compact`）、作業の終わりに送信待ちより先に送る。
- 圧縮後指示は送信待ちに入らない。預かった指示の書き直しは `@/features/compact/ui/HeldEditComposer.tsx`（状態は `@/features/compact/ui/heldEdit.ts`）。
- 書き直している間は `useEditHold` で `PUT …/queue/editing`（`lane: now`）を知らせ直す（送信待ちと同じ）。保存の前に送られたら、書いた文をふつうのチャット欄に移す。
- 会話の圧縮中は停止のボタンを出さない（`send.compacting`）。止めるのは Esc 2 回。
- 「質問として送る」（`onAsk`）は、同じ送り方でコアに `pause_after` を付ける。
