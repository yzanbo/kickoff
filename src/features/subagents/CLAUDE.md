# サブエージェント（`features/subagents`）

チャットの中で動くサブエージェントの流れのカード・画面・報告。

## 地図

- 一覧の組み立て・数え方は `@shared/chat/subagents.ts`、状態は `@shared/chat/subagentState.ts`（コア・画面・スマホが同じものを使う）。
- `core/reports.ts`: 届かなかった報告を次の指示に添える（contributor の `messageNote`。発言の `handover` に残す）。
- `ui/`: 流れのカード・カードと画面で共通の見出し `SubagentHead.tsx`（行き先のボタン `SubagentLinkActions`）と中身 `subagentBody.tsx`・見出しを押したときの開き方 `subagentOpen.ts`・色 `model/agentHues.ts`・手順の項目 `model/subagentEvents.ts`。入力欄の上のピルは chat の `AgentListChip`（子チャットと同じ形）、木をたどるのは `@shared/foundation/tree`。右の欄の画面 `SubagentScreen` は `@/features/conversation/ui/screens/`。

## 決まり

- サブエージェントはパネルのタブにせず、流れのカードと右の欄の画面で見せる。開くのは `SubagentNav` の `open`（設定の開き方）か `openSide`。
- 行は作業 ID でまとめる（SendMessage で再開すると呼び出し ID が替わる）。
- 状態は `subagentState` だけで決め、印・数・文・色はすべてこれから引く（場所ごとに判定を書かない）。
- 色は外側に起動した順に決め、入れ子は外側の祖先と同じ色。あとから足しても前の色を変えない（アーカイブしたものも含めて決める）。
- 伝える入力欄はカードの中に開く（チャット欄の宛先は切り替えない）。Kickoff から直接は送れないので、メインエージェントに SendMessage で伝えてもらう（`relayMessage`）。ID が届いていなければ出さない。
- 子チャットで聞く（`turnsApi.askSubagentInChild`）の最初の発言は前置き（`subagentAskMessage`）を隠して出し、送り直すときは付け直す。

## 落とし穴

- 孫より深いものの中の手順は Claude Code が送ってこない。途中経過の時刻は祖先の「最後の動き」に伝える（`bubbleProgress`）。
- カードの中の流れは描く側から `renderScope` で渡す（流れの部品を読むと輪になる）。
- 手順の記録は `subagentEvents.ts` で選び（中身が同じなら同じ配列）、`renderScope` に渡す（全体と比べるテストは conversation の `ui/timeline/subagentEvents.test.ts`）。
- 伝える入力欄を開いている間は一番下への付いていきを止める。Esc はパネルを閉じる Esc に渡さない。
- 数え方 `collectSubagents`（`@shared/chat/subagents.ts`）はコア（終わりのお知らせ・再開・報告の受け渡し）と画面が同じ関数（変えたら `subagents.test.ts`・`chatIndex.test.ts` を通す）。
- テスト: `core/*.test.ts`・`ui/**/*.test.ts`。
