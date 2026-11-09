// ページの中の文字を探す（⌘F）の、照らし合わせの部分（純粋関数）。画面の文字の並び（テキストのノードごと）から、合う位置を返す
// （1 つのノードの中で合うものだけ。太字・色付けで分かれた所をまたぐものは探さない）。描くのは ui/FindBar.tsx

/** 合った位置（texts の何番目の、どこからどこまで） */
export interface TextMatch {
  node: number;
  start: number;
  end: number;
}

/** 文字の並びから、query に合う位置を前から順に（大文字・小文字は区別しない。空なら何も返さない） */
export function findInTexts(texts: readonly string[], query: string): TextMatch[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const out: TextMatch[] = [];
  texts.forEach((text, node) => {
    const hay = text.toLowerCase();
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) out.push({ node, start: at, end: at + needle.length });
  });
  return out;
}

/** 次・前へ移った位置（端で回り込む。まだ選んでいなければ、次は最初・前は最後） */
export function stepMatch(index: number | null, count: number, step: 1 | -1): number | null {
  if (count === 0) return null;
  if (index === null) return step === 1 ? 0 : count - 1;
  return (index + step + count) % count;
}
