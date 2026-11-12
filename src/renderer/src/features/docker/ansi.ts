// ログの行の色（ANSI の SGR）を読む純粋な関数。アプリが付けた色はそのまま出し、ほかの制御の印（カーソルを動かすなど）は落とす

/** 色の付いたひとまとまり（fg / bg は 0〜15 なら決まった 16 色の番号、文字なら CSS の色） */
export interface AnsiSpan {
  text: string;
  fg: number | string | null;
  bg: number | string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

/** ESC で始まる制御の並び（CSI・OSC・そのほかの 1 文字） */
const CONTROL = /\u001b(?:\[([0-9;:?]*)([A-Za-z])|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;

/** 色の印を外した文（探す・見分ける・コピーする・AI に渡すとき） */
export const stripAnsi = (text: string): string => text.replace(CONTROL, "");

/** 256 色の番号（16〜255）を CSS の色に */
function color256(n: number): string {
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v}, ${v}, ${v})`;
  }
  const i = n - 16;
  const level = (x: number) => (x === 0 ? 0 : 55 + x * 40);
  return `rgb(${level(Math.floor(i / 36))}, ${level(Math.floor(i / 6) % 6)}, ${level(i % 6)})`;
}

/** 38 / 48 のあとの色（5;n か 2;r;g;b）。読んだ数の分だけ進める */
function extendedColor(codes: number[], i: number): { color: number | string | null; used: number } {
  if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
    const n = codes[i + 2];
    return { color: n < 16 ? n : color256(n), used: 2 };
  }
  if (codes[i + 1] === 2 && codes[i + 4] !== undefined) return { color: `rgb(${codes[i + 2]}, ${codes[i + 3]}, ${codes[i + 4]})`, used: 4 };
  return { color: null, used: 0 };
}

type Style = Omit<AnsiSpan, "text">;
const PLAIN: Style = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };

/** SGR の数の並びを今の見た目に当てる */
function applySgr(style: Style, params: string): Style {
  const codes = params === "" ? [0] : params.split(/[;:]/).map((c) => (c === "" ? 0 : Number(c)));
  let s = { ...style };
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) s = { ...PLAIN };
    else if (c === 1) s.bold = true;
    else if (c === 2) s.dim = true;
    else if (c === 3) s.italic = true;
    else if (c === 4) s.underline = true;
    else if (c === 22) s = { ...s, bold: false, dim: false };
    else if (c === 23) s.italic = false;
    else if (c === 24) s.underline = false;
    else if (c >= 30 && c <= 37) s.fg = c - 30;
    else if (c >= 90 && c <= 97) s.fg = c - 90 + 8;
    else if (c === 39) s.fg = null;
    else if (c >= 40 && c <= 47) s.bg = c - 40;
    else if (c >= 100 && c <= 107) s.bg = c - 100 + 8;
    else if (c === 49) s.bg = null;
    else if (c === 38 || c === 48) {
      const { color, used } = extendedColor(codes, i);
      if (c === 38) s.fg = color;
      else s.bg = color;
      i += used;
    }
  }
  return s;
}

/** 行を色ごとのまとまりに分ける（色のない行は 1 つ） */
export function ansiSpans(text: string): AnsiSpan[] {
  if (!text.includes("\u001b")) return [{ text, ...PLAIN }];
  const spans: AnsiSpan[] = [];
  let style = { ...PLAIN };
  let last = 0;
  const push = (end: number) => {
    if (end > last) spans.push({ text: text.slice(last, end), ...style });
  };
  for (const m of text.matchAll(CONTROL)) {
    push(m.index);
    last = m.index + m[0].length;
    if (m[2] === "m") style = applySgr(style, m[1] ?? "");
  }
  push(text.length);
  return spans;
}

/** 探して見つけた所の印（0 = なし・1 = 見つけた所・2 = いま選んでいる所）を付けたまとまり */
export type MarkedSpan = AnsiSpan & { mark: 0 | 1 | 2 };

/**
 * 色のまとまりを、見つけた所（色の印を外した文の位置）の境目で切って印を付ける。current は marks の何番目がいま選んでいる所か
 */
export function markSpans(spans: AnsiSpan[], marks: { start: number; end: number }[], current: number | null = null): MarkedSpan[] {
  if (marks.length === 0) return spans.map((s) => ({ ...s, mark: 0 }));
  const cuts = [...new Set(marks.flatMap((m) => [m.start, m.end]))].sort((a, b) => a - b);
  const markAt = (pos: number): 0 | 1 | 2 => {
    const i = marks.findIndex((m) => m.start <= pos && pos < m.end);
    return i < 0 ? 0 : i === current ? 2 : 1;
  };
  const out: MarkedSpan[] = [];
  let offset = 0;
  for (const span of spans) {
    const end = offset + span.text.length;
    let from = offset;
    for (const cut of [...cuts.filter((c) => c > offset && c < end), end]) {
      out.push({ ...span, text: span.text.slice(from - offset, cut - offset), mark: markAt(from) });
      from = cut;
    }
    offset = end;
  }
  return out;
}
