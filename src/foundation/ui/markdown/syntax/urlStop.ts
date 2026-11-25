/**
 * URL の自動リンク（https://・http://・www. で始まる書きかけのない URL）を、手前で終える文字の一覧（ここ 1 か所。読み取りの段と mdast の段が使う）。
 * GFM の決まりは空白まで URL として読み、終わりから外すのは半角の記号だけなので、日本語の文では（https://example.com）を開く の「）を開く」までリンクになる。
 * 日本語の文の記号・句読点・全角の形・ひらがな・… ‥・曲がった引用符で切る。漢字・カタカナでは切らない（https://ja.wikipedia.org/wiki/東京都 は 1 つ）。
 * ひらがなを含む URL を手で貼ったものは、ひらがなの手前で切れる（貼られる URL はふつう % の形なので、まれなものとして割り切る）
 */
const STOP_RANGES: readonly (readonly [number, number])[] = [
  // CJK の記号と句読点（、。「」『』【】〈〉《》〔〕〜 など）
  [0x3000, 0x303f],
  // ひらがな
  [0x3040, 0x309f],
  // 全角と半角の形（（）！？：；，． など）
  [0xff00, 0xffef],
  // ‥ …
  [0x2025, 0x2026],
  // ‘ ’ “ ”
  [0x2018, 0x2019],
  [0x201c, 0x201d],
];

/** URL をこの文字の手前で終えるか（code はコードポイント。null は文の終わり） */
export const isUrlStop = (code: number | null): boolean => code !== null && STOP_RANGES.some(([from, to]) => code >= from && code <= to);

/** 止まる文字のどれか 1 つ（u フラグの正規表現の文字の組） */
export const URL_STOP_CLASS = STOP_RANGES.map(([from, to]) => `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`).join("");
