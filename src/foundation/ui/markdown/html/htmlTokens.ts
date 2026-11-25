// Markdown の中の HTML（Markdown の読み取りが HTML と認めた所 = hast の raw の文）を、タグ・文字・コメントに分ける小さな読み取り。
// HTML 用の読み取りの部品（parse5 など）は使わない: 閉じていないタグを補う決まりで節が入力の 2 乗に膨らみ、後ろの文まで巻き込むため。
// タグとして読むのは CommonMark のタグの書き方に合い、名前と属性の名前がすべて小文字で、一覧（htmlAllowlist.ts）にあるものだけ。ほかは書いたままの文字
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { HTML_TAGS, PICTURE_ONLY } from "./htmlAllowlist";

export type HtmlToken =
  | { type: "start"; name: string; attrs: [name: string, value: string | null][]; selfClosing: boolean; source: string }
  | { type: "end"; name: string; source: string }
  | { type: "comment"; source: string }
  | { type: "text"; value: string; source: string };

const WS = "[ \\t\\n\\r\\f]";
const ATTR_NAME = "[a-zA-Z_:][a-zA-Z0-9_.:-]*";
const VALUE = "[^\"'=<>`\\s]+|'[^']*'|\"[^\"]*\"";
/** 開きのタグ（CommonMark の open tag） */
const OPEN = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)((?:${WS}+${ATTR_NAME}(?:${WS}*=${WS}*(?:${VALUE}))?)*)${WS}*(/?)>`, "y");
/** 開きのタグの中の属性 1 つ */
const ATTR = new RegExp(`${WS}+(${ATTR_NAME})(?:${WS}*=${WS}*(${VALUE}))?`, "g");
/** 閉じのタグ（CommonMark の closing tag） */
const CLOSE = new RegExp(`</([a-zA-Z][a-zA-Z0-9-]*)${WS}*>`, "y");

/** 文字参照（CommonMark と同じ: ; で終わるものだけ） */
const CHAR_REF = /&(?:#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z][A-Za-z0-9]{0,31}));/g;

/** 文字参照を文字に戻す（名前の参照は Markdown の読み取りと同じ表。読めないものは書いたまま。0・範囲の外・サロゲートは U+FFFD） */
export function decodeCharacterReferences(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(CHAR_REF, (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name !== undefined) {
      // 名前は英数字だけ（上の正規表現）。ブラウザ版の表引きは要素の innerHTML に入れるので、ほかの文字を渡さない
      const decoded = decodeNamedCharacterReference(name);
      return decoded === false ? match : decoded;
    }
    const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? "", 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "�" : String.fromCodePoint(code);
  });
}

const isLower = (name: string) => name === name.toLowerCase();
const isKnownTag = (name: string) => HTML_TAGS.has(name) || name === PICTURE_ONLY;

/** 属性の値の引用符を外して文字参照を戻す（値のない属性は null） */
function attributeValueOf(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const unquoted = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
  return decodeCharacterReferences(unquoted);
}

/** pos から始まるコメントの長さ（<!-->・<!--->・<!-- … -->。--!> を含むもの・閉じのないものは 0 = コメントでない） */
function commentLength(raw: string, pos: number): number {
  if (!raw.startsWith("<!--", pos)) return 0;
  if (raw.startsWith("<!-->", pos)) return 5;
  if (raw.startsWith("<!--->", pos)) return 6;
  const close = raw.indexOf("-->", pos + 4);
  if (close < 0 || raw.slice(pos + 4, close).includes("--!>")) return 0;
  return close + 3 - pos;
}

/**
 * pos から始まる、文字のまま出す HTML の書き方（<?…?>・<![CDATA[…]]>・<!X…>）の長さ。中身ごと文字にする（中のタグも読まない）。なければ 0。
 * HTML では中身が描かれない所なので、中のタグを要素にすると、ブラウザと違う見え方になる
 */
function declarationLength(raw: string, pos: number): number {
  const ends: [string, string][] = [
    ["<?", "?>"],
    ["<![CDATA[", "]]>"],
  ];
  for (const [open, close] of ends) {
    if (!raw.startsWith(open, pos)) continue;
    const end = raw.indexOf(close, pos + open.length);
    return end < 0 ? raw.length - pos : end + close.length - pos;
  }
  if (/^<![A-Za-z]/.test(raw.slice(pos, pos + 3))) {
    const end = raw.indexOf(">", pos);
    return end < 0 ? raw.length - pos : end + 1 - pos;
  }
  return 0;
}

/** pos から始まるタグ（一覧にあって小文字のもの）。なければ null */
function tagAt(raw: string, pos: number): HtmlToken | null {
  CLOSE.lastIndex = pos;
  const close = CLOSE.exec(raw);
  if (close) return isLower(close[1]) && isKnownTag(close[1]) ? { type: "end", name: close[1], source: close[0] } : null;
  OPEN.lastIndex = pos;
  const open = OPEN.exec(raw);
  if (!open || !isLower(open[1]) || !isKnownTag(open[1])) return null;
  const attrs: [string, string | null][] = [];
  for (const m of open[2].matchAll(ATTR)) {
    // 大文字を含む属性の名前があれば、タグごと文字のまま
    if (!isLower(m[1])) return null;
    // 同じ名前は初めのものだけ（HTML と同じ）
    if (!attrs.some(([name]) => name === m[1])) attrs.push([m[1], attributeValueOf(m[2])]);
  }
  return { type: "start", name: open[1], attrs, selfClosing: open[3] === "/", source: open[0] };
}

/** raw の文をタグ・文字・コメントに分ける（並んだ文字は 1 つにまとめる） */
export function tokenizeHtml(raw: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let textStart = 0;
  const flushText = (end: number) => {
    if (end > textStart) {
      const source = raw.slice(textStart, end);
      tokens.push({ type: "text", value: decodeCharacterReferences(source), source });
    }
  };
  let pos = raw.indexOf("<");
  while (pos >= 0) {
    const declaration = declarationLength(raw, pos);
    if (declaration > 0) {
      // 文字のまま（文字参照も戻さない）
      flushText(pos);
      tokens.push({ type: "text", value: raw.slice(pos, pos + declaration), source: raw.slice(pos, pos + declaration) });
      textStart = pos + declaration;
      pos = raw.indexOf("<", textStart);
      continue;
    }
    const comment = commentLength(raw, pos);
    const token = comment > 0 ? ({ type: "comment", source: raw.slice(pos, pos + comment) } as const) : tagAt(raw, pos);
    if (token) {
      flushText(pos);
      tokens.push(token);
      textStart = pos + token.source.length;
      pos = raw.indexOf("<", textStart);
    } else {
      pos = raw.indexOf("<", pos + 1);
    }
  }
  flushText(raw.length);
  return tokens;
}
