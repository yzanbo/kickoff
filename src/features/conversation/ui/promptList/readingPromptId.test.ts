import assert from "node:assert/strict";
import { test } from "vitest";
import { eventSequence } from "@shared/foundation/testing/factories";
import { promptListOf } from "./promptHistory";
import { readingPromptId } from "./readingPromptId";

// 位置だけを返す小さな偽の DOM（readingPromptId が読むセレクタと位置だけ。jsdom は使わない）
interface Box {
  top: number;
  bottom: number;
}
interface FakeRow extends Box {
  /** 自分の発言・質問への回答の行なら、その記録の ID（吹き出しの id も ev-<ID>） */
  promptId?: number;
  /** 吹き出しの上端（省けば行の上端） */
  bubbleTop?: number;
  /** 行の中の項目（記録の ID と位置。省けば行そのもの 1 つ） */
  items?: (Box & { id: number })[];
}

const rect = ({ top, bottom }: Box) => ({ top, bottom }) as DOMRect;
const el = (props: object) => props as unknown as HTMLElement;

/** 流れ（上端 timelineTop）と枠（上端 wrapTop）・行・窓の箱（描いていない行） */
function fakeTimeline({ timelineTop = 100, wrapTop = 60, rows, boxes = [] }: { timelineTop?: number; wrapTop?: number; rows: (FakeRow & { id?: number })[]; boxes?: number[] }) {
  const rowEls = rows.map((row) => {
    const bubble = row.promptId === undefined ? null : el({ id: `ev-${row.promptId}`, getBoundingClientRect: () => rect({ top: row.bubbleTop ?? row.top, bottom: row.bottom }) });
    const items = (row.items ?? [{ id: row.promptId ?? row.id ?? 0, top: row.top, bottom: row.bottom }]).map((i) => el({ id: `ev-${i.id}`, getBoundingClientRect: () => rect(i) }));
    return el({
      dataset: row.promptId === undefined ? {} : { promptId: String(row.promptId) },
      getBoundingClientRect: () => rect(row),
      querySelector: (s: string) => (s === ".bubble.user" ? bubble : null),
      querySelectorAll: () => items,
    });
  });
  const boxEls = boxes.map((top) => el({ getBoundingClientRect: () => rect({ top, bottom: top + 50 }) }));
  return el({
    getBoundingClientRect: () => rect({ top: timelineTop, bottom: timelineTop + 500 }),
    parentElement: el({ getBoundingClientRect: () => rect({ top: wrapTop, bottom: wrapTop + 540 }) }),
    querySelectorAll: (s: string) =>
      s.endsWith(".timeline-row[data-prompt-id]") ? rowEls.filter((r) => r.dataset.promptId !== undefined) : s.endsWith(".timeline-box") ? boxEls : rowEls,
  });
}

const event = eventSequence();
// 記録: 1 指示・2 返答・3 指示・4 返答・5 質問への回答・6 返答
const events = [
  event("user", { text: "一つ目" }),
  event("text", { text: "返答" }),
  event("user", { text: "二つ目" }),
  event("text", { text: "返答" }),
  event("approval_resolved", { approval_id: "a", kind: "question", action: "answer", answers: { 色は: "赤" } }),
  event("text", { text: "返答" }),
];
const prompts = promptListOf(events);

test("流れの上端を越えた、いちばん下の吹き出しの記録の ID（質問への回答も数える）", () => {
  const timeline = fakeTimeline({
    rows: [
      { promptId: 1, top: -200, bottom: -150 },
      { id: 2, top: -150, bottom: 0 },
      { promptId: 3, top: 0, bottom: 50 },
      { id: 4, top: 50, bottom: 300 },
      { promptId: 5, top: 300, bottom: 350 },
    ],
  });
  assert.equal(readingPromptId(timeline, prompts), 3);
  const answered = fakeTimeline({ rows: [{ promptId: 3, top: -100, bottom: -50 }, { promptId: 5, top: -50, bottom: 0 }, { id: 6, top: 0, bottom: 300 }] });
  assert.equal(readingPromptId(answered, prompts), 5);
});

test("上端より上に描いた吹き出しがなければ、見えている最初の項目より前の指示を記録から。それもなければ最初の吹き出し", () => {
  // 窓に吹き出しがない（返答の途中を読んでいる）: 見えている最初の項目 4 より前の指示 3
  assert.equal(readingPromptId(fakeTimeline({ rows: [{ id: 4, top: 0, bottom: 600 }] }), prompts), 3);
  // いちばん上を見ている: 最初の吹き出し
  assert.equal(readingPromptId(fakeTimeline({ rows: [{ promptId: 1, top: 120, bottom: 170 }] }), prompts), 1);
  assert.equal(readingPromptId(fakeTimeline({ rows: [] }), prompts), undefined);
});

test("吹き出しと線の間に窓の箱があれば、その中の新しい指示を記録から出す", () => {
  const timeline = fakeTimeline({ rows: [{ promptId: 1, top: -500, bottom: -450 }, { id: 4, top: 50, bottom: 400 }], boxes: [-300] });
  assert.equal(readingPromptId(timeline, prompts), 3);
});

test("帯に出している指示は、選んだときの線より下へ戻るまで出し続ける", () => {
  // 指示 3 の行が流れの上端（101）より下に来ても、選んだときの線（枠から 45 = 105 ＋ ゆとり）を越えるまでは 3 のまま
  const rows = (top: number) => [{ promptId: 1, top: -200, bottom: -150 }, { promptId: 3, top, bottom: top + 50 }, { id: 4, top: top + 50, bottom: 500 }];
  assert.equal(readingPromptId(fakeTimeline({ rows: rows(103) }), prompts), 1);
  assert.equal(readingPromptId(fakeTimeline({ rows: rows(103) }), prompts, { id: 3, line: 45 }), 3);
  assert.equal(readingPromptId(fakeTimeline({ rows: rows(110) }), prompts, { id: 3, line: 45 }), 1);
});
