// 数式で長さを取る命令（KaTeX 0.19.1 の \raisebox・\rule・\kern・\mkern・\hskip・\mskip・\hspace・\\[…]・\genfrac・\above）の大きさを、
// ふつうの数式に足りる範囲に抑えるマクロ（katexOptions.ts の macros に入れる）。KaTeX の maxSize は正の大きさしか丸めず
// （\raisebox{-30em}{Z} は 30em の深さの箱になり、行の中の式でも段落が縦に空く）、上の向きの 10em も文の行には大きすぎるため。
// マクロは命令より先に引き当てられるので、引数を読んで大きさを確かめ、元の命令（noexpand の印を付けた字句。マクロとして引き直さない）に
// 抑えた大きさを付けて戻す。大きさが範囲の中なら、読んだ字句をそのまま戻す（ふつうの式の見た目は変わらない）。
// 読み方は KaTeX の Parser.parseSizeGroup と同じ（{…}・[…]・括弧なしの 3em の形。中のマクロは展開してから見る）

/** KaTeX のマクロに渡る字句（katex の Token の一部） */
interface KatexToken {
  text: string;
  noexpand?: boolean;
}

/** KaTeX のマクロに渡る展開器（MacroExpander の口のうち使うもの。consumeArg・expandTokens の字句は積む順＝逆順） */
interface MacroContext {
  future(): KatexToken;
  popToken(): KatexToken;
  pushToken(token: KatexToken): void;
  consumeSpaces(): void;
  consumeArg(delims?: string[]): { tokens: KatexToken[] };
  expandTokens(tokens: KatexToken[]): KatexToken[];
  expandNextToken(): KatexToken;
}

/**
 * 縦の大きさの上限（em）。1 つの大きさは VERTICAL_MAX まで、1 つの式の中の縦の大きさの合計は VERTICAL_TOTAL まで
 * （\raisebox を入れ子にする・\\[…] を並べると、1 つずつ抑えても足し合わさるため）。ふつうの式の縦の大きさ（\rule{0pt}{2.5ex}・
 * \raisebox{0.5ex}・\\[6pt]・\\[1em]・分数の線 0.4pt）は 1em に収まり、行の間を空ける \\[2ex] を 10 行並べても 8.6em
 */
const VERTICAL_MAX = 3;
const VERTICAL_TOTAL = 10;
/**
 * 横の大きさの上限（em）。KaTeX の maxSize と同じ 10em（\hspace{2cm} ≒ 5.7em のような横の空きは今のまま）。
 * 負の大きさも同じだけにする（式の外へ出た分は Markdown.css で描かないが、式の中の文字に重ねられる量を抑える）
 */
const HORIZONTAL_MAX = 10;
/**
 * 分数の線の太さの上限（em）。KaTeX は線の太さの数倍を分子・分母との間に空ける（3em の線で式の箱が 22em になる）ので、
 * 縦の大きさより小さくし（ふつうは 0.4pt〜2pt ＝ 0.04〜0.2em）、合計にも RULE_WEIGHT 倍で数える（0.25em の線の分数は段落の式で 2.5em ほど）
 */
const RULE_MAX = 0.25;
const RULE_WEIGHT = 8;

/** 大きさの引数の向き（v: 縦・h: 横・rule: 分数の線の太さ）・書き方（optional: [ ] の省ける引数。immediate: すぐ後ろに [ があるときだけ（\\ と同じく空白を飛ばさない）） */
type Axis = "v" | "h" | "rule";
type Slot = { axis: Axis; optional?: "spaced" | "immediate" } | "arg";
const V = { axis: "v" } as const;
const H = { axis: "h" } as const;

/** 命令ごとの引数の並び（大きさの引数の後ろは読まない。"arg" は大きさの前の数式の引数で、そのまま戻す） */
const SLOTS: Readonly<Record<string, readonly Slot[]>> = {
  "\\raisebox": [V],
  "\\rule": [{ axis: "v", optional: "spaced" }, H, V],
  "\\kern": [H],
  "\\mkern": [H],
  "\\hskip": [H],
  "\\mskip": [H],
  "\\above": [{ axis: "rule" }],
  "\\genfrac": ["arg", "arg", { axis: "rule" }],
  "\\\\": [{ axis: "v", optional: "immediate" }],
};

/** KaTeX が大きさの文から数と単位を読む正規表現（Parser.parseSizeGroup と同じ。前後に余計な文字があっても最初の一致を使う） */
const SIZE = /([-+]?) *(\d+(?:\.\d*)?|\.\d+) *([a-z]{2})/;
/** 括弧なしの大きさとして読み続ける形（Parser.parseSizeGroup と同じ） */
const BARE_SIZE = /^[-+]? *(?:$|\d+|\d+\.\d*|\.\d*) *[a-z]{0,2} *$/;
/** 1 単位の em（本文の大きさ。KaTeX の ptPerEm = 10・xHeight = 0.431・1em = 18mu） */
const EM_PER_UNIT: Readonly<Record<string, number>> = {
  em: 1,
  ex: 0.431,
  mu: 1 / 18,
  pt: 0.1,
  mm: 7227 / 25400,
  cm: 7227 / 2540,
  in: 7.227,
  bp: 803 / 8000,
  pc: 1.2,
  dd: 1238 / 11570,
  cc: 14856 / 11570,
  nd: 685 / 6420,
  nc: 1370 / 1070,
  sp: 1 / 655360,
  px: 803 / 8000,
};

/** 大きさの文の em（読めない・知らない単位なら null。KaTeX が誤りとして出す） */
export function sizeInEm(text: string): number | null {
  const m = SIZE.exec(text);
  const perUnit = m ? EM_PER_UNIT[m[3] ?? ""] : undefined;
  return m && perUnit !== undefined ? Number(`${m[1]}${m[2]}`) * perUnit : null;
}

/**
 * 長さを取る命令のマクロ（1 つの式を描くたびに作る。縦の大きさの合計を式ごとに数えるため）。
 * KaTeX の字句の型は公開されていないので、新しい字句は読んだ字句と同じ型（constructor）で作る
 */
export function lengthMacros(): Record<string, (context: object) => object> {
  let verticalLeft = VERTICAL_TOTAL;

  /** 大きさを範囲に収めた字句（範囲の中なら読んだまま） */
  const limit = (tokens: KatexToken[], axis: Axis, make: (text: string) => KatexToken): KatexToken[] => {
    const em = sizeInEm(tokens.map((t) => t.text).join(""));
    if (em === null) return tokens;
    const weight = axis === "rule" ? RULE_WEIGHT : 1;
    const max = axis === "h" ? HORIZONTAL_MAX : Math.min(axis === "rule" ? RULE_MAX : VERTICAL_MAX, verticalLeft / weight);
    const kept = Math.min(Math.abs(em), max);
    if (axis !== "h") verticalLeft -= kept * weight;
    if (Math.abs(em) <= max) return tokens;
    return Array.from(`${em < 0 ? "-" : ""}${Number(kept.toFixed(4))}em`, make);
  };

  const macro = (name: string, slots: readonly Slot[]) => (context: object) => {
    const ctx = context as MacroContext;
    const Token = ctx.future().constructor as new (text: string) => KatexToken;
    const make = (text: string) => new Token(text);
    const command = make(name);
    command.noexpand = true;
    const out: KatexToken[] = [command];
    for (const slot of slots) {
      if (slot === "arg") {
        out.push(make("{"), ...ctx.consumeArg().tokens.reverse(), make("}"));
        continue;
      }
      if (slot.optional) {
        if (slot.optional === "spaced") ctx.consumeSpaces();
        if (ctx.future().text !== "[") continue;
        ctx.popToken();
        out.push(make("["), ...limit(ctx.expandTokens(ctx.consumeArg(["]"]).tokens), slot.axis, make), make("]"));
        continue;
      }
      ctx.consumeSpaces();
      if (ctx.future().text === "{") {
        out.push(make("{"), ...limit(ctx.expandTokens(ctx.consumeArg().tokens), slot.axis, make), make("}"));
        continue;
      }
      // 括弧なし（\kern-3em など）は、KaTeX と同じく展開した字句を形に合う限り読む（読めなければ何も足さず、KaTeX の誤りのまま）
      const tokens: KatexToken[] = [];
      for (;;) {
        const next = ctx.expandNextToken();
        if (next.text === "EOF" || !BARE_SIZE.test(tokens.map((t) => t.text).join("") + next.text)) {
          ctx.pushToken(next);
          break;
        }
        tokens.push(next);
      }
      if (tokens.length > 0) out.push(make("{"), ...limit(tokens, slot.axis, make), make("}"));
    }
    return { tokens: out.reverse(), numArgs: 0 };
  };

  return Object.fromEntries(Object.entries(SLOTS).map(([name, slots]) => [name, macro(name, slots)]));
}
