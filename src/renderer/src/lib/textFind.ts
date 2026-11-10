// ページ・チャットの中の文字を探す（⌘F）の、照らし合わせの部分（純粋関数）。探し方（大文字・小文字を区別・単語単位・正規表現。VS Code と同じ 3 つ）は
// どの検索でも同じ形で、画面の文字の並び（テキストのノードごと）から合う位置を返す（1 つのノードの中で合うものだけ。太字・色付けで分かれた所をまたぐものは探さない）。
// 描くのは ui/FindBar.tsx・チャットの中の検索（features/chat/find）

/** 探し方（VS Code の検索の欄の「Aa」「ab」「.*」） */
export interface FindOptions {
  /** 大文字・小文字を区別する */
  caseSensitive: boolean;
  /** 単語単位（前後が文字・数字・_ でないところだけ） */
  wholeWord: boolean;
  /** 正規表現として探す */
  regex: boolean;
}

export const FIND_OPTION_NAMES = ["caseSensitive", "wholeWord", "regex"] as const satisfies readonly (keyof FindOptions)[];
export type FindOptionName = (typeof FIND_OPTION_NAMES)[number];

/** 探し方の名前と、切り替えのキー（⌥⌘C / ⌥⌘W / ⌥⌘R。VS Code と同じ。⌥ を押すと文字が変わるので、キーの位置で見る） */
export const FIND_OPTION_LABELS: Record<FindOptionName, { label: string; keys: string; code: string }> = {
  caseSensitive: { label: "大文字と小文字を区別する", keys: "⌥⌘C", code: "KeyC" },
  wholeWord: { label: "単語単位で探す", keys: "⌥⌘W", code: "KeyW" },
  regex: { label: "正規表現を使う", keys: "⌥⌘R", code: "KeyR" },
};

export const DEFAULT_FIND_OPTIONS: FindOptions = { caseSensitive: false, wholeWord: false, regex: false };

/** 合った位置（文の中のどこからどこまで） */
export interface TextSpan {
  start: number;
  end: number;
}

/** 合った位置（texts の何番目の、どこからどこまで） */
export interface TextMatch extends TextSpan {
  node: number;
}

/** 探す形。空の文なら null、正規表現として読めなければ error（欄に誤りと出す） */
export type FindPattern = { re: RegExp } | { error: string } | null;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 単語の文字（前後がこれでないところだけを単語単位で合うとみなす） */
const WORD = String.raw`[\p{L}\p{N}_]`;

/** query と探し方から、探す正規表現を作る。query は打ったまま使い、前後の空白も削らない（半角・全角の空白も探す文字のうち。VS Code と同じ） */
export function findPattern(query: string, options: FindOptions = DEFAULT_FIND_OPTIONS): FindPattern {
  if (!query) return null;
  const body = options.regex ? query : escapeRegExp(query);
  const source = options.wholeWord ? `(?<!${WORD})(?:${body})(?!${WORD})` : body;
  try {
    return { re: new RegExp(source, options.caseSensitive ? "gu" : "giu") };
  } catch (e) {
    return { error: e instanceof SyntaxError ? "正規表現として読めません" : String(e) };
  }
}

/** 文 text の中で pattern に合う位置（重ならないように前から。幅 0 の一致は飛ばす） */
export function spansIn(text: string, pattern: FindPattern): TextSpan[] {
  if (!pattern || "error" in pattern) return [];
  const re = new RegExp(pattern.re.source, pattern.re.flags);
  const out: TextSpan[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0].length === 0) {
      // 「^」「a*」などの幅 0 の一致は印を付けられないので飛ばし、次の文字から探し直す
      re.lastIndex += 1;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** 文字の並びから、query に合う位置を前から順に（空なら・正規表現の誤りなら何も返さない） */
export function findInTexts(texts: readonly string[], query: string, options: FindOptions = DEFAULT_FIND_OPTIONS): TextMatch[] {
  const pattern = findPattern(query, options);
  const out: TextMatch[] = [];
  texts.forEach((text, node) => {
    for (const span of spansIn(text, pattern)) out.push({ node, ...span });
  });
  return out;
}

/** 検索の欄で押したキーが、探し方の切り替え（⌥⌘C / ⌥⌘W / ⌥⌘R）なら、その名前 */
export function findOptionOfKey(e: { code: string; metaKey: boolean; altKey: boolean; ctrlKey: boolean; shiftKey: boolean }): FindOptionName | null {
  if (!e.metaKey || !e.altKey || e.ctrlKey || e.shiftKey) return null;
  return FIND_OPTION_NAMES.find((name) => FIND_OPTION_LABELS[name].code === e.code) ?? null;
}

/** 次・前へ移った位置（端で回り込む。まだ選んでいなければ、次は最初・前は最後） */
export function stepMatch(index: number | null, count: number, step: 1 | -1): number | null {
  if (count === 0) return null;
  if (index === null) return step === 1 ? 0 : count - 1;
  return (index + step + count) % count;
}
