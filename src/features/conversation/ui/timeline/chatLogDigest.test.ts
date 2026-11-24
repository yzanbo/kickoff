import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { ChatDetail, ChatEventPage } from "@shared/chat/detail";
import { makeChat, makeEvent } from "@shared/chat/testing";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import { indexOfEvents, type IndexContext } from "@shared/chat/chatIndex";
import { digestOf, focusLater, prefaceOf, prependTail, rangeFromDetail, shrinkTail, withFocus, type LogRange } from "@/features/chat/ui/testing";
import { chatVisualsOf } from "@/features/visuals/ui";
import { promptListOf } from "@/features/conversation/ui/promptList/promptHistory";
import { collectTodoList } from "@/features/conversation/ui/todo/todoList";
import { lastResultIdOf } from "@/features/conversation/ui/working/workingLabel";
import { failedTurnOf } from "@/features/conversation/ui/rewind/retryActions";
import { groupEvents, type TimelineItem } from "./timelineItems";
import { itemIndexOfEvent } from "./timelineWindow";

// chat の記録の範囲（索引 ＋ 末尾。@/features/chat/ui/store/chatLog.ts）から作った画面のものが、記録の全件から作ったものと同じか

const NO_CTX: IndexContext = { approvalCallIds: [], backgroundCallIds: [] };

/** ターンの頭（作業の終わりの直後）の位置 */
const turnHeads = (events: readonly ChatEvent[]) => [0, ...events.flatMap((e, i) => (e.type === "result" && i + 1 < events.length ? [i + 1] : []))];

/** 切れ目 s（ターンの頭）で開いたときの範囲と末尾（コアの詳細と同じ形から作る） */
function openedAt(events: ChatEvent[], s: number): { range: LogRange; tail: ChatEvent[] } {
  const tail = events.slice(s);
  const detail = { chat: makeChat(1), events: tail, index: s === 0 ? [] : indexOfEvents(events, events[s].id, NO_CTX), has_earlier: s > 0, head_partial: false } as unknown as ChatDetail;
  return { range: rangeFromDetail(detail), tail };
}

/** 画面の記録全体から作るもの（指示の一覧・ToDo・図・失敗した作業・最後の作業の終わり） */
function screenResults(events: ChatEvent[]) {
  const prompts = promptListOf(events);
  return {
    prompts: prompts.entries.map((p) => [p.id, p.text, p.compactKind]),
    history: prompts.history.map((p) => [p.id, p.label, p.cleared]),
    todos: collectTodoList(events),
    visuals: chatVisualsOf(events),
    failed: failedTurnOf(events),
    lastResult: lastResultIdOf(events),
  };
}

/** 流れの項目の頭の記録の ID */
const firstIdOf = (item: TimelineItem): number =>
  item.kind === "event" || item.kind === "subagentEnd" ? item.event.id : item.kind === "tools" ? item.tools[0].use.id : item.call.use.id;

test("どのターンの頭で開いても、末尾 ＋ 索引から作った画面のもの（指示の一覧・ToDo・図・失敗・流れの項目）が全件と同じ（ランダムな記録。種は固定）", () => {
  for (const [seed, running] of [[4, false], [5, true], [9, false]] as const) {
    const events = scenarioChat({ turns: 20, seed, running });
    const full = screenResults(events);
    const fullItems = groupEvents(events);
    for (const s of turnHeads(events)) {
      const { range, tail } = openedAt(events, s);
      assert.deepEqual(screenResults(digestOf(range, tail)), full, `種 ${seed} 切れ目 ${s}`);
      // 流れの項目: 末尾の分は、全件から作った項目のうち末尾にあるものと同じ（前に起動した裏のサブエージェントの終わりの 1 行も）
      const tailItems = groupEvents(tail, undefined, { preface: prefaceOf(range, tail) });
      const start = events[s].id;
      assert.deepEqual(tailItems, fullItems.filter((item) => firstIdOf(item) >= start), `種 ${seed} 切れ目 ${s} の項目`);
    }
  }
});

test("さかのぼって前を足しても、縮めても、画面のものは全件と同じ", () => {
  const events = scenarioChat({ turns: 18, seed: 12 });
  const full = screenResults(events);
  const heads = turnHeads(events);
  const late = heads[heads.length - 3];
  const mid = heads[Math.floor(heads.length / 2)];
  const opened = openedAt(events, late);
  const page: ChatEventPage = { events: events.slice(mid, late), has_earlier: true, has_later: false, head_partial: false };
  const back = prependTail(opened.range, opened.tail, page);
  assert.deepEqual(screenResults(digestOf(back.range, back.tail)), full);
  const small = shrinkTail(back.range, back.tail, NO_CTX, 3);
  assert.deepEqual(screenResults(digestOf(small.range, small.tail)), full);
});

test("途中の一部分を下へ伸ばして末尾につないだら、流れの項目は頭から数える", () => {
  const events = Array.from({ length: 12 }, (_, i) => makeEvent(i + 1, i % 3 === 2 ? "result" : "text", i % 3 === 2 ? { status: "completed" } : { text: `${i}` }));
  const { range, tail } = openedAt(events, 9);
  const focused = withFocus(range, tail, { events: events.slice(3, 6), has_earlier: true, has_later: true, head_partial: false });
  const joined = focusLater(focused.range, focused.tail, { events: events.slice(6, 9), has_earlier: true, has_later: false, head_partial: false });
  assert.equal(itemIndexOfEvent(groupEvents(joined.tail), 4), 0);
});
