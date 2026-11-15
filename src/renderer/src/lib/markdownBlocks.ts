/**
 * Markdown の文を、空行で区切ったまとまり（ブロック）に分けるための読み取り。続きの文なら、増えた行だけを読む。
 * いまは、書きかけの返答を少しずつ出す決まり（`markdownReveal.ts`）が、最後のブロックの頭と、開いたままのコードブロック・数式ブロックを知るのに使う
 * （メモの仕様書「0023_表示を軽くする」の案 6c。ブロックごとの memo（案 15）も同じ分け方を使う）。
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
