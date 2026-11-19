import type { Element, ElementContent, Root, RootContent } from "hast";

/**
 * 生成中の返答を、届いた塊のまま一度に出さず、少しずつ流れるように出すための純粋な部分。
 * - `nextRevealLength`: 次のフレームで何文字まで出すか（遅れが大きいほど速く追いつく）
 * - `revealBands`: 出たばかりの文字を、出てからの時間で何段かに分けた数（新しい順）
 * - `wrapStreamTail`: 描く木の終わりの文字を、その段ごとに薄く出す span で包む（CSS の `.stream-fade-1` など）。ブロックへの割り振りは `splitTail`
 */

/** 遅れ（まだ出していない文字）を、おおよそこの時間で出し切る */
const CATCH_UP_MS = 320;
/** 遅れが少なくても、1 秒にこれだけは出す（最後の数文字がゆっくりになりすぎないように） */
const MIN_CHARS_PER_SECOND = 90;
/** 出たばかりの文字を薄く出す時間（この間に、段ごとに濃くなる） */
export const REVEAL_FADE_MS = 300;
/** 薄く出す段の数（新しいほど薄い。CSS の `.stream-fade-1` 〜 `.stream-fade-3`） */
const REVEAL_BANDS = 3;

/** shown 文字まで出しているとき、dt ミリ秒後に何文字まで出すか（target を超えない。サロゲートペアの途中では切らない） */
export function nextRevealLength(text: string, shown: number, dtMs: number): number {
  const target = text.length;
  if (shown >= target) return target;
  const remaining = target - shown;
  const step = Math.max((MIN_CHARS_PER_SECOND * dtMs) / 1000, (remaining * Math.min(dtMs, CATCH_UP_MS)) / CATCH_UP_MS);
  let next = Math.min(target, shown + Math.max(1, Math.round(step)));
  // 絵文字などの 2 つで 1 文字のものは、片方だけを出さない
  const code = text.charCodeAt(next - 1);
  if (next < target && code >= 0xd800 && code <= 0xdbff) next += 1;
  return next;
}

/**
 * 少しずつ出すときに描く文の決まり（text の shown 文字目まで出したいとき、実際に出す長さ length と描く文 render）。
 * Markdown の書きかけの記号を補う・手前で止める決まりは `markdownReveal.ts` の `createMarkdownRevealLimit`
 */
export type RevealLimit = (text: string, shown: number) => { length: number; render: string };

/** 出した長さの記録（時刻と、その時に出していた文字数。古い順） */
export interface RevealMark {
  at: number;
  length: number;
}

/**
 * 出たばかりの文字を、出てからの時間で REVEAL_BANDS 段に分けた数（新しい順）。
 * marks は古い順の記録で、now - REVEAL_FADE_MS より古いものが 1 つ残っていれば、そこを境にする
 */
export function revealBands(marks: readonly RevealMark[], now: number): number[] {
  const current = marks.at(-1)?.length ?? 0;
  const lengthAt = (time: number) => {
    // time の時点で出していた長さ（それより前の最後の記録。なければいちばん古い記録）
    let length = marks[0]?.length ?? current;
    for (const m of marks) {
      if (m.at > time) break;
      length = m.length;
    }
    return length;
  };
  const bands: number[] = [];
  let upper = current;
  for (let i = 1; i <= REVEAL_BANDS; i++) {
    const lower = lengthAt(now - (REVEAL_FADE_MS * i) / REVEAL_BANDS);
    bands.push(Math.max(0, upper - lower));
    upper = Math.min(upper, lower);
  }
  return bands;
}

/**
 * 出たばかりの文字の段（新しい順の文字数）を、ブロックごとに割り振る（Markdown をブロックに分けて描くため）。
 * 後ろのブロックから、ブロックの文の長さ（記号を含む見積もり）まで割り当て、あふれた分を 1 つ前のブロックに渡す。
 * 段の位置（何段目か）は保つ。段のないブロックは undefined（memo が効くように）
 */
export function splitTail(lengths: readonly number[], bands: readonly number[] | undefined): (number[] | undefined)[] {
  const out: (number[] | undefined)[] = lengths.map(() => undefined);
  if (!bands?.some((n) => n > 0)) return out;
  const left = bands.slice();
  for (let i = lengths.length - 1; i >= 0 && left.some((n) => n > 0); i--) {
    let room = lengths[i];
    const mine = left.map(() => 0);
    for (let b = 0; b < left.length && room > 0; b++) {
      const take = Math.min(left[b], room);
      mine[b] = take;
      left[b] -= take;
      room -= take;
    }
    if (mine.some((n) => n > 0)) out[i] = mine;
  }
  return out;
}

type Parent = Root | Element;

/**
 * 木の文字を後ろから数え、新しい段から順に `span.stream-fade-<段>` で包む（その場で書き換える）。
 * コードブロック（pre）の中は数えない（色付け・コピーが文字を読むため）
 */
export function wrapStreamTail(tree: Root, bands: readonly number[]) {
  if (!bands.some((n) => n > 0)) return;
  // 文字の節を、親と並びの位置とともに前から集める
  const texts: { parent: Parent; node: { type: "text"; value: string } }[] = [];
  const walk = (parent: Parent) => {
    for (const child of parent.children as (RootContent | ElementContent)[]) {
      if (child.type === "text") texts.push({ parent, node: child });
      else if (child.type === "element" && child.tagName !== "pre") walk(child);
    }
  };
  walk(tree);
  // 後ろから、それぞれの文字が何段目か（0 = 段の外）を決める
  let band = 0;
  let left = bands[0] ?? 0;
  const nextBand = () => {
    while (left <= 0 && band < bands.length) {
      band += 1;
      left = bands[band] ?? 0;
    }
  };
  nextBand();
  for (let t = texts.length - 1; t >= 0 && band < bands.length; t--) {
    const { parent, node } = texts[t];
    const pieces: ElementContent[] = [];
    let end = node.value.length;
    while (end > 0 && band < bands.length) {
      const start = Math.max(0, end - left);
      pieces.unshift(fadeSpan(node.value.slice(start, end), band + 1));
      left -= end - start;
      end = start;
      nextBand();
    }
    if (end > 0) pieces.unshift({ type: "text", value: node.value.slice(0, end) });
    const siblings = parent.children as ElementContent[];
    siblings.splice(siblings.indexOf(node), 1, ...pieces);
  }
}

function fadeSpan(value: string, band: number): Element {
  return { type: "element", tagName: "span", properties: { className: [`stream-fade-${band}`] }, children: [{ type: "text", value }] };
}
