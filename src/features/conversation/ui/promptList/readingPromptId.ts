// 上に貼り付ける指示の帯が、流れの DOM から読むもの（いま読んでいる指示の記録の ID だけ。文・回答・種類・添付は指示の一覧から引く）
import { promptBefore, type PromptList } from "./promptHistory";

/** 帯に出している指示を出し続ける線のゆとり（帯の高さの端数をスクロールの位置に丸めた差で、境目を行き来しないように） */
const HOLD_SLACK_PX = 1.5;

/**
 * 帯に出している指示と、それを選んだときの線（流れの枠 `.timeline-wrap` の上端からの距離）。
 * 出している指示の吹き出しは、流れの上端ではなく、この線（と流れの上端の低い方）を越えて下へ戻るまで出し続ける
 */
export interface PinnedHold {
  id: number;
  line: number;
}

/** いまの線（流れの上端 ＋ 1px）を、流れの枠の上端からの距離で（帯に出す指示を選んだときに覚える） */
export function readingLine(timeline: HTMLElement): number {
  const top = timeline.getBoundingClientRect().top;
  return top + 1 - (timeline.parentElement?.getBoundingClientRect().top ?? top);
}

/** 吹き出しの記録の ID（要素の id は `ev-<記録の ID>`） */
const bubbleId = (bubble: HTMLElement) => Number(bubble.id.replace("ev-", ""));

/**
 * いま読んでいる返答の元の自分の発言（帯に出す指示）の記録の ID: 流れの上端まで流れた（上端より上から始まる）いちばん下の吹き出し。
 * 読んでいる位置より上に描いている吹き出しがなければ、見えている最初の項目より前のいちばん新しい指示を記録の一覧（prompts）から出す
 * （流れは最近の項目だけを描く窓なので、1 回の作業でツール・返答が多いと、窓の中に自分の吹き出しが 1 つも入らず、帯が消えていた）。
 * それもなければ（いちばん上を見ている）、最初の吹き出し。吹き出しも指示もなければ undefined。AI からの質問への回答も同じ吹き出しなので数える。
 * 帯に出している指示（hold）とそれより前の吹き出しは、選んだときの線まで流れたものとみなす（`PinnedHold`）。
 * 帯の高さは指示ごとに違い（全文を出しているとき）、帯が替わると流れの上端が動くので、上端だけで決めると、
 * 一番下に付いていく間などに、替わった先の高さでまた元の指示に戻り、境目で帯が毎フレーム替わり続けた
 */
export function readingPromptId(timeline: HTMLElement, prompts: PromptList, hold?: PinnedHold): number | undefined {
  const timelineTop = timeline.getBoundingClientRect().top;
  const line = timelineTop + 1;
  const holdLine = hold ? Math.max(line, (timeline.parentElement?.getBoundingClientRect().top ?? timelineTop) + hold.line + HOLD_SLACK_PX) : line;
  // 自分の発言・質問への回答の行（行の包みの data-prompt-id）を上から見る。位置は行の包みで読み、線をまたぐ行だけ中の吹き出しの位置を読む
  // （画面の外の行は描くのを省いているので、中の要素の位置を読むと、その行のレイアウトを強いる）
  const rows = promptRows(timeline);
  let found: HTMLElement | undefined;
  for (const row of rows) {
    const held = hold !== undefined && Number(row.dataset.promptId) <= hold.id;
    const limit = held ? holdLine : line;
    const box = row.getBoundingClientRect();
    // 吹き出しは行の中にあるので、行の上端が線より下なら吹き出しも下
    if (box.top >= limit) break;
    const bubble = row.querySelector<HTMLElement>(".bubble.user");
    if (!bubble) continue;
    if (box.bottom > limit && bubble.getBoundingClientRect().top >= limit) break;
    found = bubble;
  }
  // 見つけた吹き出しと線の間に窓の箱（描いていない行）があれば、その中に新しい指示があるかもしれないので記録から決める。
  // 読んでいる位置より上に描いている吹き出しがない（窓の外にある・最初の吹き出しより上を見ている）ときも、見えている最初の項目より前の指示を記録から
  if (!found || boxBetween(timeline, found, line)) {
    const first = firstVisibleEventId(timeline, line);
    const before = first !== undefined ? promptBefore(prompts, first) : undefined;
    if (before && (!found || before.id > bubbleId(found))) return before.id;
  }
  found ??= rows[0]?.querySelector<HTMLElement>(".bubble.user") ?? undefined;
  if (!found) return undefined;
  const id = bubbleId(found);
  return Number.isFinite(id) ? id : undefined;
}

/** 吹き出しより下・線より上に、流れの窓の箱（描いていない行の代わり）があるか */
function boxBetween(timeline: HTMLElement, bubble: HTMLElement, line: number): boolean {
  const from = bubble.getBoundingClientRect().top;
  for (const box of timeline.querySelectorAll<HTMLElement>(":scope > .timeline-inner > .timeline-box")) {
    const top = box.getBoundingClientRect().top;
    if (top > from && top < line) return true;
  }
  return false;
}

/** 会話の流れの行の包み（入れ子のカードの中の行は含めない）のうち、自分の発言・質問への回答の行 */
const promptRows = (timeline: HTMLElement) => [...timeline.querySelectorAll<HTMLElement>(":scope > .timeline-inner > .timeline-row[data-prompt-id]")];

/**
 * 流れの上端の線より下に掛かっている、いちばん上の項目の記録の ID（項目の要素の id は `ev-<記録の ID>`。なければ undefined）。
 * 線より上で終わる行は包みの位置だけで飛ばし、中の要素の位置は線に掛かる行（描いている行）でだけ読む
 */
function firstVisibleEventId(timeline: HTMLElement, line: number): number | undefined {
  for (const row of timeline.querySelectorAll<HTMLElement>(":scope > .timeline-inner > .timeline-row")) {
    if (row.getBoundingClientRect().bottom <= line) continue;
    for (const el of row.querySelectorAll<HTMLElement>('[id^="ev-"]')) {
      if (el.getBoundingClientRect().bottom <= line) continue;
      const id = Number(el.id.slice(3));
      if (Number.isFinite(id) && id > 0) return id;
    }
  }
  return undefined;
}
