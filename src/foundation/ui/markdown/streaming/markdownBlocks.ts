/**
 * Markdown の文を、空行で区切ったまとまり（ブロック）に分けるための読み取り。続きの文なら、増えた行だけを読む。
 * - `createBlockScanner`: 書きかけの返答を少しずつ出す決まり（`markdownReveal.ts`）が、最後のブロックの頭と、開いたままのコードブロック・数式ブロックを知るのに使う
 * - `splitBlocks` / `createBlockSplitter`: Markdown の部品がブロックごとに memo して描くための分け方（下）
 * 空行でも分けないところ: コードブロック（``` / ~~~ の開きから閉じまで）と数式ブロック（$$ だけの行から $$ だけの行まで）の中
 */

/** 開いたままのコードブロック */
interface OpenFence {
  /** 開きの行の頭 */
  start: number;
  char: "`" | "~";
  /** 開きの印の長さ（閉じはこれ以上の長さ） */
  length: number;
  /** 開きの行が改行まで来たか（言語名が決まったか） */
  infoDone: boolean;
}

/** 文の終わりの様子 */
export interface BlockTail {
  /** 最後のブロックの頭（空行のあとの最初の行。空行で終わっていれば、次の行が来るまで前のブロックのまま） */
  blockStart: number;
  /** 開いたままのコードブロック */
  fence: OpenFence | null;
  /** 開いたままの数式ブロック（開きの $$ の行の頭） */
  mathStart: number | null;
  /** 最後に閉じたコードブロック・数式ブロックの、閉じの行の次の位置（なければ 0） */
  closedAt: number;
}

export interface BlockScanner {
  /** text の end 文字目までを読んだときの終わりの様子（前に読んだ文の続きなら、増えた行だけ読む） */
  scan(text: string, end?: number): BlockTail;
}

interface ScanState {
  blockStart: number;
  /** 直前の行が空行か（次の行で新しいブロックが始まる） */
  afterBlank: boolean;
  fence: OpenFence | null;
  mathStart: number | null;
  closedAt: number;
}

/** コードブロックの開き（行の頭の空白・3 つ以上の ` か ~・言語名など） */
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})(.*)$/;
/** コードブロックの閉じ（印だけの行） */
const FENCE_CLOSE = /^[ \t]*(`+|~+)[ \t]*$/;

/** 行がコードブロックの開きなら、その印 */
function fenceOpenOf(line: string): { char: "`" | "~"; length: number } | null {
  const m = FENCE_OPEN.exec(line);
  if (!m) return null;
  const char = m[1][0] as "`" | "~";
  // ``` の言語名に ` は書けない（文の中のコードとして読まれる）
  if (char === "`" && m[2].includes("`")) return null;
  return { char, length: m[1].length };
}

function closesFence(line: string, fence: OpenFence): boolean {
  const m = FENCE_CLOSE.exec(line);
  return m !== null && m[1][0] === fence.char && m[1].length >= fence.length;
}

const initialState = (): ScanState => ({ blockStart: 0, afterBlank: false, fence: null, mathStart: null, closedAt: 0 });

/** 改行まで来た 1 行を読む（start は行の頭、next は次の行の頭） */
function readLine(st: ScanState, line: string, start: number, next: number) {
  if (st.fence) {
    if (closesFence(line, st.fence)) {
      st.fence = null;
      st.closedAt = next;
    }
    return;
  }
  if (st.mathStart !== null) {
    if (line.trim() === "$$") {
      st.mathStart = null;
      st.closedAt = next;
    }
    return;
  }
  if (line.trim() === "") {
    st.afterBlank = true;
    return;
  }
  if (st.afterBlank) {
    st.blockStart = start;
    st.afterBlank = false;
  }
  const open = fenceOpenOf(line);
  if (open) st.fence = { start, ...open, infoDone: true };
  else if (line.trim() === "$$") st.mathStart = start;
}

/** 改行がまだの最後の行（start から）を、読んだ様子に足した終わりの様子（読んだ様子は変えない） */
function tailOf(st: ScanState, partial: string, start: number): BlockTail {
  const tail: BlockTail = { blockStart: st.blockStart, fence: st.fence, mathStart: st.mathStart, closedAt: st.closedAt };
  if (st.fence || st.mathStart !== null || partial.trim() === "") return tail;
  if (st.afterBlank) tail.blockStart = start;
  const open = fenceOpenOf(partial);
  if (open) tail.fence = { start, ...open, infoDone: false };
  else if (partial.trim() === "$$") tail.mathStart = start;
  return tail;
}

/** 読み取りを作る（書きかけの返答 1 つごとに 1 つ。続きでない文が来たら初めから読み直す） */
export function createBlockScanner(): BlockScanner {
  // 読み終えた行（最後の改行まで）の文と、そこまでの様子
  let done = "";
  let state = initialState();
  return {
    scan(text, end = text.length) {
      if (end < done.length || !text.startsWith(done)) {
        done = "";
        state = initialState();
      }
      let pos = done.length;
      const lastNewline = text.lastIndexOf("\n", end - 1);
      if (lastNewline >= pos) {
        while (pos <= lastNewline) {
          const nl = text.indexOf("\n", pos);
          readLine(state, text.slice(pos, nl), pos, nl + 1);
          pos = nl + 1;
        }
        done = text.slice(0, pos);
      }
      return tailOf(state, text.slice(pos, end), pos);
    },
  };
}

/*
 * ブロックに分ける（書き終えたブロックは描いたものを使い回し、描き直すのは最後のブロックだけにする）。
 * 分けると描き方が変わる所では分けない（分けないのはいつも安全なので、迷う所は分けない側に倒す）:
 * - コードブロック・数式ブロック（$$ で始まる行から $$ だけの行まで）・空行をまたぐ HTML ブロック（<script・<pre・<style・<textarea・<!--・<?・<!X・<![CDATA[）の中
 * - 空行のあとの行が字下げで始まる（箇条書きの続き・字下げのコード）か、箇条書きのあるブロックで次の行も箇条書きの印（空行をはさんだ項目は 1 つのゆるいリスト）
 * - リンクの参照の定義・脚注の定義（[x]: …）が 1 つでもあれば、全体を 1 つのブロックにする（文全体で引き当てるため）
 */

/** ブロックに分けた結果 */
interface MarkdownBlocks {
  /** ブロックの文（末尾の空行は落とす。前と同じ範囲のブロックは前と同じ文字列を返す） */
  blocks: string[];
  /** 最後のブロックで、閉じていないコードブロックの開きの行の頭（最後のブロックの中の位置。なければ null） */
  openFence: number | null;
}

export interface BlockSplitter {
  /** text をブロックに分ける（前に分けた文の続きなら、増えた行だけ読む） */
  split(text: string): MarkdownBlocks;
}

interface SplitState {
  fence: { char: "`" | "~"; length: number; start: number } | null;
  math: boolean;
  /** 空行をまたぐ HTML ブロックの終わりの印 */
  html: RegExp | null;
  afterBlank: boolean;
  /** いまのブロックに箇条書きの印の行がある */
  list: boolean;
  /** 参照・脚注の定義があった（全体を 1 つにする） */
  whole: boolean;
  /** ブロックの頭（文の中の位置） */
  starts: number[];
}

const LIST_ITEM = /^ {0,3}([-+*]|\d{1,9}[.)])([ \t]|$)/;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:/;
const MATH_OPEN = /^ {0,3}\$\$/;
/** 空行をまたぐ HTML ブロックの始まりと終わりの印 */
const HTML_BLOCKS: [RegExp, RegExp][] = [
  [/^ {0,3}<(script|pre|style|textarea)([\s>]|$)/i, /<\/(script|pre|style|textarea)>/i],
  [/^ {0,3}<!--/, /-->/],
  [/^ {0,3}<\?/, /\?>/],
  [/^ {0,3}<![A-Za-z]/, />/],
  [/^ {0,3}<!\[CDATA\[/, /\]\]>/],
];

const initialSplit = (): SplitState => ({ fence: null, math: false, html: null, afterBlank: false, list: false, whole: false, starts: [0] });
const copySplit = (st: SplitState): SplitState => ({ ...st, starts: st.starts.slice() });

/** 1 行を読む（start は行の頭） */
function splitLine(st: SplitState, line: string, start: number) {
  if (st.fence) {
    const m = FENCE_CLOSE.exec(line);
    if (m && m[1][0] === st.fence.char && m[1].length >= st.fence.length) st.fence = null;
    return;
  }
  if (st.math) {
    if (line.trim() === "$$") st.math = false;
    return;
  }
  if (st.html) {
    if (st.html.test(line)) st.html = null;
    return;
  }
  if (line.trim() === "") {
    st.afterBlank = true;
    return;
  }
  if (st.afterBlank) {
    st.afterBlank = false;
    // 字下げで始まる行（箇条書きの続き・字下げのコード）と、箇条書きのあとの箇条書きは、前のブロックに続ける
    if (!/^[ \t]/.test(line) && !(st.list && LIST_ITEM.test(line))) {
      st.starts.push(start);
      st.list = false;
    }
  }
  if (REFERENCE_DEFINITION.test(line)) st.whole = true;
  if (LIST_ITEM.test(line)) st.list = true;
  const open = fenceOpenOf(line);
  if (open) {
    st.fence = { ...open, start };
    return;
  }
  if (MATH_OPEN.test(line)) {
    // 同じ行で閉じていなければ数式ブロック（閉じの $$ だけの行まで）
    const rest = line.trim().slice(2);
    if (!rest.includes("$$")) st.math = true;
    return;
  }
  for (const [begin, end] of HTML_BLOCKS) {
    const m = begin.exec(line);
    if (m) {
      if (!end.test(line.slice(m[0].length))) st.html = end;
      return;
    }
  }
}

/** 末尾の空行を落とした終わりの位置 */
function trimmedEnd(text: string, start: number, end: number): number {
  let e = end;
  while (e > start) {
    const lineStart = Math.max(start, text.lastIndexOf("\n", e - 1) + 1);
    if (text.slice(lineStart, e).trim() !== "") break;
    e = lineStart > start ? lineStart - 1 : start;
  }
  return e;
}

/** 分ける読み取りを作る（書きかけの返答 1 つごとに 1 つ。続きでない文が来たら初めから読み直す） */
export function createBlockSplitter(): BlockSplitter {
  let done = "";
  let state = initialSplit();
  let prev: { start: number; end: number; text: string }[] = [];
  return {
    split(text) {
      if (!text.startsWith(done)) {
        done = "";
        state = initialSplit();
        prev = [];
      }
      let pos = done.length;
      const lastNewline = text.lastIndexOf("\n");
      if (lastNewline >= pos) {
        while (pos <= lastNewline) {
          const nl = text.indexOf("\n", pos);
          splitLine(state, text.slice(pos, nl), pos);
          pos = nl + 1;
        }
        done = text.slice(0, pos);
      }
      // 改行がまだの最後の行は、読んだ様子の写しに足す（次に読むときは改行まで来てから）
      const st = pos < text.length ? copySplit(state) : state;
      if (pos < text.length) splitLine(st, text.slice(pos), pos);
      const starts = st.whole ? [0] : st.starts;
      const open = st.whole ? false : st.fence !== null || st.math || st.html !== null;
      const ranges = starts.map((start, i) => {
        const last = i === starts.length - 1;
        const end = last ? text.length : starts[i + 1];
        return { start, end: last && open ? end : trimmedEnd(text, start, end) };
      });
      const next = ranges.map((r, i) => (prev[i]?.start === r.start && prev[i].end === r.end ? prev[i] : { ...r, text: text.slice(r.start, r.end) }));
      prev = next;
      const lastStart = starts[starts.length - 1];
      return { blocks: next.map((b) => b.text), openFence: st.fence && !st.whole ? st.fence.start - lastStart : null };
    },
  };
}

/** 文を一度にブロックに分ける（確定した文） */
export function splitBlocks(text: string): string[] {
  return createBlockSplitter().split(text).blocks;
}
