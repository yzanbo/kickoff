// ノートの編集の画面（@lezer/markdown）の強調・取り消し線の読み取りを、返答の表示と同じ日本語向けの決まりにする拡張。
// 元の Emphasis・Strikethrough の前に置いて同じ印を先に読む。作る木の名前（StrongEmphasis・Emphasis・Strikethrough と各 Mark）は元と同じなので、
// livePreview.ts の装飾はそのまま効く
import { InlineContext, type MarkdownConfig } from "@lezer/markdown";
import { attentionSides, strikethroughSides, type Around } from "@/foundation/ui/markdown/syntax/cjkFlanking";

/** 取り消し線の印の種類（元の Strikethrough の拡張と同じ名前の節を作る。元の種類は公開されていないので同じ形を持つ） */
const StrikethroughDelim = { resolve: "Strikethrough", mark: "StrikethroughMark" };

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** pos の文字（文字の単位。この段の外は -1。char は段の前を NaN で返すので、ここでそろえる） */
const unitAt = (cx: InlineContext, pos: number): number => (pos < cx.offset ? -1 : cx.char(pos));

/** pos の手前の文字（コードポイント。範囲の外は null） */
function codeBefore(cx: InlineContext, pos: number): number | null {
  const low = unitAt(cx, pos - 1);
  if (low < 0) return null;
  const high = unitAt(cx, pos - 2);
  return isLow(low) && isHigh(high) ? (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000 : low;
}

/** pos の文字（コードポイント。範囲の外は null） */
function codeAt(cx: InlineContext, pos: number): number | null {
  const high = unitAt(cx, pos);
  if (high < 0) return null;
  const low = unitAt(cx, pos + 1);
  return isHigh(high) && isLow(low) ? (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000 : high;
}

function around(cx: InlineContext, start: number, end: number): Around {
  const previous = codeBefore(cx, start);
  const width = previous !== null && previous > 0xffff ? 2 : 1;
  return { previous, twoPrevious: () => codeBefore(cx, start - width), next: codeAt(cx, end) };
}

export const cjkFriendlyEmphasis: MarkdownConfig = {
  parseInline: [
    {
      name: "CjkFriendlyEmphasis",
      parse(cx, next, start) {
        if (next !== 42 && next !== 95) return -1;
        let pos = start + 1;
        while (cx.char(pos) === next) pos++;
        const { open, close } = attentionSides(next === 42 ? "*" : "_", around(cx, start, pos));
        return cx.addDelimiter(next === 95 ? InlineContext.emphasisUnderscore : InlineContext.emphasisAsterisk, start, pos, open, close);
      },
      before: "Emphasis",
    },
    {
      name: "CjkFriendlyStrikethrough",
      parse(cx, next, pos) {
        // ~~ だけ（~ 1 つ・3 つ以上は取り消し線にしない。元の Strikethrough と同じ）
        if (next !== 126 || cx.char(pos + 1) !== 126 || cx.char(pos + 2) === 126) return -1;
        const { open, close } = strikethroughSides(around(cx, pos, pos + 2));
        return cx.addDelimiter(StrikethroughDelim, pos, pos + 2, open, close);
      },
      before: "Strikethrough",
    },
  ],
};
