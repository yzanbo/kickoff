/**
 * Markdown として読むと危ない形のブロックか（読む前に文字の数だけで決める）。当たったブロックは Markdown として読まずに、書いたままの文字で出す。
 * いまの読み取り（remark-parse・GFM の部品。micromark）は、閉じない強調の記号が続くと記号の数の 2 乗より速く遅くなり、入れ子の印が深いとスタックがあふれる。
 *
 * しきい値は、同じ組（remark-parse → GFM の部品 → remark-rehype）に流して Node で測った時間から決めた（M2 Pro。1 ブロック）:
 * - 閉じない「*a」の繰り返し: * が 5,000 個で 184ms・6,000 個で 256ms・10,000 個で 552ms・16,000 個で 3.1 秒（「~a」もほぼ同じ）。
 *   _ は前後が記号・空白・行の端だと * と同じ重さ（「_.」が 5,000 個で 172ms・17,000 個で 2.4 秒。「_!」「_)」「_「」「a_(」も同じ）。
 *   前後とも文字（英数字・かな・漢字）の _（snake_case）は軽い（「a_b」が 12,000 個で 328ms・18,000 個で 664ms）。閉じた「**太字**」は * が 16,000 個でも 141ms
 * - 行頭の > の入れ子: 1,000 段で 9ms・3,000 段でスタックあふれ。「* 」の入れ子のリスト: 500 段で 79ms・2,000 段でスタックあふれ
 * - 字下げで深くした入れ子のリスト（1 段 2 文字）: 100 段で 37ms・200 段で 167ms・400 段で 1.2 秒
 * - リンクの [ ] ( : 「[a](」の繰り返しは 15,000 個で 230ms・20,000 個で 2.7 秒（読み取りの中で急に遅くなる）。「![」の入れ子は 500 段で 132ms・
 *   700 段で 268ms・1,000 段で 572ms。開きのない ] は、脚注の読み取りが ] ごとに手前の [ まで戻って探すので、] の数と戻る長さの積で遅くなる
 *   （「]」と「\!」20 個の繰り返しで、積が 1,000 万で 297ms・2,000 万で 932ms）。閉じたリンク「[a](b)」は 10,000 個で 229ms
 * - ふつうの文: 60 万字の段落で 95ms・25 万字（6,000 行）の表で 336ms（長さには比例するだけ）
 * ふつうの返答の 1 ブロック（空行で区切ったまとまり）は、強調の記号が数百、入れ子が数段、字下げが数十文字で、どれにも遠く届かない。
 * 一番上のコードブロック（``` / ~~~）の中は Markdown として読まれないので数えない（リストの中のコードブロックは数える。多めに見て止める側に倒す）
 */

/** 強調の記号の重み付きの数の上限（* と ~ と前後のどちらかが文字でない _ は 1、前後とも文字の _ は 1/2。測った時間で 250ms ほど） */
const MAX_EMPHASIS_WEIGHT = 6_000;
/** リンクの行き先の開き（](）の数の上限 */
const MAX_LINK_RESOURCES = 5_000;
/** [ の入れ子の深さの上限（閉じていない [ の数。ふつうのリンクの中の画像は 2 段。32 段の「![」の入れ子を 150 個並べて 189ms） */
const MAX_BRACKET_DEPTH = 32;
/** ] ごとの、手前の [ までの字数の合計の上限（脚注の読み取りが戻って探す長さ。測った時間で 250ms ほど） */
const MAX_BRACKET_WALK = 8_000_000;
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

/** 語の中の文字（前後ともこれなら、_ は開き・閉じにならない） */
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

/** 文の中の強調の記号の重み付きの数（文の中のコードを除いた行） */
function emphasisWeight(line: string): number {
  let weight = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "*" || ch === "~") weight += 1;
    else if (ch === "_") weight += WORD_CHAR.test(line[i - 1] ?? "") && WORD_CHAR.test(line[i + 1] ?? "") ? 0.5 : 1;
  }
  return weight;
}

/** リンクの [ ] ( の数え（行をまたいで数える） */
interface BracketCount {
  /** ]( の数 */
  resources: number;
  /** 閉じていない [ の数 */
  depth: number;
  /** いちばん近い [ からの字数（[ がまだなければブロックの頭から） */
  sinceOpen: number;
  /** ] ごとの sinceOpen の合計 */
  walk: number;
}

/** 1 行（文の中のコードを除いたもの）の [ ] ( を数える。上限を超えたら true（\ で消した記号は数えない） */
function countBrackets(line: string, count: BracketCount): boolean {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") {
      i++;
      count.sinceOpen += 2;
      continue;
    }
    if (ch === "[") {
      count.depth++;
      count.sinceOpen = 0;
      if (count.depth > MAX_BRACKET_DEPTH) return true;
    } else if (ch === "]") {
      count.walk += count.sinceOpen;
      if (count.depth > 0) count.depth--;
      if (line[i + 1] === "(") count.resources++;
      if (count.walk > MAX_BRACKET_WALK || count.resources > MAX_LINK_RESOURCES) return true;
    }
    count.sinceOpen++;
  }
  // 行の終わりの改行の分
  count.sinceOpen++;
  return false;
}

/** Markdown として読むと危ない形か（true なら書いたままの文字で出す） */
export function isRiskyMarkdownBlock(text: string): boolean {
  if (text.length > MAX_BLOCK_CHARS) return true;
  let weight = 0;
  const brackets: BracketCount = { resources: 0, depth: 0, sinceOpen: 0, walk: 0 };
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
    const plain = line.replace(INLINE_CODE, "");
    weight += emphasisWeight(plain);
    if (weight > MAX_EMPHASIS_WEIGHT || countBrackets(plain, brackets)) return true;
  }
  return false;
}
