/**
 * Markdown として読むと危ない形のブロックか（読む前に文字の数だけで決める）。当たったブロックは Markdown として読まずに、書いたままの文字で出す。
 * いまの読み取り（remark-parse・GFM の部品。micromark）は、閉じない強調の記号が続くと記号の数の 2 乗より速く遅くなり、入れ子の印が深いとスタックがあふれる。
 *
 * しきい値は、同じ組（remark-parse → GFM の部品 → remark-rehype）に流して Node で測った時間から決めた（M2 Pro。1 ブロック）:
 * - 閉じない「*a」の繰り返し: * が 5,000 個で 184ms・6,000 個で 256ms・10,000 個で 552ms・16,000 個で 3.1 秒（「~a」もほぼ同じ）。
 *   「_a」は 20,000 個で 544ms・30,000 個で 1.2 秒（* の 1/3 ほど）。閉じた「**太字**」は * が 16,000 個でも 141ms
 * - 行頭の > の入れ子: 1,000 段で 9ms・3,000 段でスタックあふれ。「* 」の入れ子のリスト: 500 段で 79ms・2,000 段でスタックあふれ
 * - 字下げで深くした入れ子のリスト（1 段 2 文字）: 100 段で 37ms・200 段で 167ms・400 段で 1.2 秒
 * - ふつうの文: 60 万字の段落で 95ms・25 万字（6,000 行）の表で 336ms（長さには比例するだけ）
 * ふつうの返答の 1 ブロック（空行で区切ったまとまり）は、強調の記号が数百、入れ子が数段、字下げが数十文字で、どれにも遠く届かない。
 * 一番上のコードブロック（``` / ~~~）の中は Markdown として読まれないので数えない（リストの中のコードブロックは数える。多めに見て止める側に倒す）
 */

/** 強調の記号の重み付きの数の上限（* と ~ は 1、_ は 1/3。測った時間で 250ms ほど） */
const MAX_EMPHASIS_WEIGHT = 6_000;
/** 1 行の頭に並ぶ入れ子の印（> と箇条書きの印）の数の上限 */
const MAX_LINE_NESTING = 100;
/** 行の頭の字下げの上限（列。タブは 4 列。1 段 2 文字の入れ子で 128 段・測った時間で 60ms ほど） */
const MAX_INDENT_COLUMNS = 256;
/** 1 ブロックの字数の上限（長さに比例する分だけでも 400ms を超えないところ） */
const MAX_BLOCK_CHARS = 300_000;

/** 一番上のコードブロックの開き（頭の空白は 3 つまで。``` の言語名に ` は書けない） */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
/** 行の頭に並ぶ入れ子の印（> ・- ・* ・+ ・1. ・1) ） */
const NESTING_PREFIX = /^(?:[ \t]*(?:>|[-*+](?=[ \t]|$)|\d{1,9}[.)](?=[ \t]|$)))+/;
/** 文の中のコード（` で囲んだ所。中の記号は強調にならない） */
const INLINE_CODE = /`[^`\n]*`/g;

/** 行の頭の字下げの列（タブは 4 列） */
function indentColumns(line: string): number {
  let columns = 0;
  for (const ch of line) {
    if (ch === " ") columns += 1;
    else if (ch === "\t") columns += 4;
    else break;
  }
  return columns;
}

/** 行の頭に並ぶ入れ子の印の数 */
function nestingOf(line: string): number {
  const prefix = NESTING_PREFIX.exec(line)?.[0];
  if (!prefix) return 0;
  return prefix.replace(/[ \t]/g, "").replace(/\d{1,9}[.)]/g, "#").length;
}

/** 文の中の強調の記号の重み付きの数（文の中のコードを除く） */
function emphasisWeight(line: string): number {
  let stars = 0;
  let underscores = 0;
  for (const ch of line.replace(INLINE_CODE, "")) {
    if (ch === "*" || ch === "~") stars++;
    else if (ch === "_") underscores++;
  }
  return stars + underscores / 3;
}

/** Markdown として読むと危ない形か（true なら書いたままの文字で出す） */
export function isRiskyMarkdownBlock(text: string): boolean {
  if (text.length > MAX_BLOCK_CHARS) return true;
  let weight = 0;
  let fence: { char: string; length: number } | null = null;
  for (const line of text.split("\n")) {
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { char: open[1][0], length: open[1].length };
      continue;
    }
    if (indentColumns(line) > MAX_INDENT_COLUMNS || nestingOf(line) > MAX_LINE_NESTING) return true;
    weight += emphasisWeight(line);
    if (weight > MAX_EMPHASIS_WEIGHT) return true;
  }
  return false;
}
