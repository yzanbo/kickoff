import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatDetail, ChatEvent, ChatEventPage } from "@shared/types";
import { makeChat, makeEvent } from "@shared/foundation/testing/factories";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import { indexOfEvents, type IndexContext } from "@shared/chat/chatIndex";
import { promptListOf } from "@/features/conversation/ui/promptList/promptHistory";
import { collectTodoList } from "@/features/conversation/ui/todo/todoList";
import { lastResultIdOf } from "@/features/conversation/ui/working/workingLabel";
import { failedTurnOf } from "@/features/conversation/ui/rewind/retryActions";
import { chatVisualsOf } from "@/features/visuals/ui/visualsContext";
import { groupEvents, type TimelineItem } from "@/features/conversation/ui/timeline/timelineItems";
import { itemIndexOfEvent } from "@/features/conversation/ui/timeline/timelineWindow";
import {
  deleteFrom,
  digestOf,
  displays,
  EMPTY_RANGE,
  focusLater,
  joinSince,
  prefaceOf,
  prependTail,
  rangeFromDetail,
  shrinkTail,
  turnHeadOf,
  turnsBefore,
  withFocus,
  type LogRange,
} from "./chatLog";

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

test("さかのぼって前を足しても、近い所まで末尾を伸ばしても、縮めても、画面のものは全件と同じ", () => {
  const events = scenarioChat({ turns: 18, seed: 12 });
  const full = screenResults(events);
  const heads = turnHeads(events);
  const late = heads[heads.length - 3];
  const mid = heads[Math.floor(heads.length / 2)];
  const opened = openedAt(events, late);
  // さかのぼる: mid から late の手前まで
  const page: ChatEventPage = { events: events.slice(mid, late), has_earlier: true, has_later: false, head_partial: false };
  const back = prependTail(opened.range, opened.tail, page);
  assert.equal(back.range.tailStart, events[mid].id);
  assert.deepEqual(screenResults(digestOf(back.range, back.tail)), full);
  // 近い所まで伸ばす: 頭のターンの頭から
  const target = events[mid + 1].id;
  assert.equal(turnHeadOf(opened.range, target), events[mid].id);
  assert.equal(turnsBefore(opened.range, target), heads.filter((h) => h > mid && h <= late).length);
  const joined = joinSince(opened.range, opened.tail, page);
  assert.equal(displays(joined.range, joined.tail, target), true);
  // 縮める: 最新 3 ターンだけ残す
  const small = shrinkTail(back.range, back.tail, NO_CTX, 3);
  assert.equal(small.tail[0].id, events[heads[heads.length - 3]].id);
  assert.deepEqual(screenResults(digestOf(small.range, small.tail)), full);
});

test("途中の一部分: 流れに出すのはその記録だけで、下へ伸ばして末尾に届いたら末尾につなぐ。巻き戻しで後ろを消す", () => {
  const events = Array.from({ length: 12 }, (_, i) => makeEvent(i + 1, i % 3 === 2 ? "result" : "text", i % 3 === 2 ? { status: "completed" } : { text: `${i}` }));
  const { range, tail } = openedAt(events, 9);
  const focusPage: ChatEventPage = { events: events.slice(3, 6), has_earlier: true, has_later: true, head_partial: false };
  const focused = withFocus(range, tail, focusPage);
  assert.deepEqual(focused.range.focus?.events.map((e) => e.id), [4, 5, 6]);
  assert.equal(displays(focused.range, focused.tail, 5), true);
  assert.equal(displays(focused.range, focused.tail, 10), false);
  // 前に起動したものを数える記録は、途中の一部分より前だけ
  assert.ok(prefaceOf(focused.range, focused.tail).every((e) => e.id < 4));
  const joined = focusLater(focused.range, focused.tail, { events: events.slice(6, 9), has_earlier: true, has_later: false, head_partial: false });
  assert.equal(joined.range.focus, null);
  assert.deepEqual(joined.tail.map((e) => e.id), [4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(joined.range.tailStart, 4);
  assert.equal(deleteFrom(focused.range, 5).focus?.events.length, 1);
  // 索引がない（末尾で読んでいない）詳細なら、すべてを読んでいる
  assert.deepEqual(rangeFromDetail({ chat: makeChat(1), events } as unknown as ChatDetail), EMPTY_RANGE);
  assert.equal(itemIndexOfEvent(groupEvents(joined.tail), 4), 0);
});
