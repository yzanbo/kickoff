// Markdown の中の HTML で描いてよいタグ・属性・値の一覧（読み取り htmlTokens.ts と、木にしたあとの確かめ htmlVerify.ts が同じ一覧を使う）。
// 一覧にないものは描かない。属性の値は、ここで読み直した形だけを要素に入れる（書かれた文字列をそのまま入れない）
import { linkTargetOf, webLinkOf } from "@shared/foundation/linkTarget";

/** 描いてよいタグ（小文字だけ。picture は中の img だけを描く。rp は中身ごと消す） */
export const HTML_TAGS: ReadonlySet<string> = new Set([
  ..."br wbr hr".split(" "),
  ..."b i u strong em s strike del ins sub sup small big mark center font".split(" "),
  ..."code tt kbd samp var q cite dfn abbr time".split(" "),
  ..."details summary ruby rt rp".split(" "),
  ..."p div span blockquote pre h1 h2 h3 h4 h5 h6 section article aside header footer nav main address".split(" "),
  ..."ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col figure figcaption a img picture".split(" "),
]);

/** picture の中でだけタグとして読み、描かずに消すもの（picture の外では文字のまま） */
export const PICTURE_ONLY = "source";

/** 閉じの要らないタグ */
export const VOID_TAGS: ReadonlySet<string> = new Set(["br", "wbr", "hr", "img", "col", PICTURE_ONLY]);

/** 中のタグを描かずに文字だけにするタグ（コードのコピーのボタンが、見えている文字と同じものを写すため） */
export const TEXT_ONLY_TAGS: ReadonlySet<string> = new Set(["pre", "code"]);

/** 文の中に置けるタグ（段落をまたげない。中に置けるのもこれだけ） */
export const PHRASING_TAGS: ReadonlySet<string> = new Set(
  "a abbr b big br cite code dfn em font i img input ins kbd mark picture q ruby s samp small span strike strong sub sup time tt u var wbr del button".split(" "),
);

/** 中に文の中のものしか置けない入れ物（段落・見出し・summary など。文の中のタグも同じ） */
export const PHRASING_ONLY_PARENTS: ReadonlySet<string> = new Set([...PHRASING_TAGS, "p", "h1", "h2", "h3", "h4", "h5", "h6", "summary", "dt", "caption", "figcaption", "rt", "rp"]);

/** 決まった親の中でだけ要素にするタグ（表の部品は table の中だけ、など） */
export const REQUIRED_PARENT: Readonly<Record<string, readonly string[]>> = {
  li: ["ul", "ol"],
  dt: ["dl"],
  dd: ["dl"],
  thead: ["table"],
  tbody: ["table"],
  tfoot: ["table"],
  caption: ["table"],
  colgroup: ["table"],
  tr: ["table", "thead", "tbody", "tfoot"],
  td: ["tr"],
  th: ["tr"],
  col: ["colgroup", "table"],
  summary: ["details"],
  rt: ["ruby"],
  rp: ["ruby"],
  figcaption: ["figure"],
};

/** 子に置けるものが決まった入れ物（ほかの子・空白でない文字があれば、入れ物ごと文字のまま） */
export const ALLOWED_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  ul: ["li"],
  ol: ["li"],
  dl: ["dt", "dd"],
  table: ["caption", "colgroup", "thead", "tbody", "tfoot", "tr"],
  thead: ["tr"],
  tbody: ["tr"],
  tfoot: ["tr"],
  tr: ["td", "th"],
  colgroup: ["col"],
  picture: ["img"],
};

/** 閉じを省けるタグ → それを閉じる開きのタグ（入れ物の閉じでも閉じる。入れ物が閉じたときだけ要素になる） */
export const IMPLIED_END: Readonly<Record<string, readonly string[]>> = {
  li: ["li"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  td: ["td", "th", "tr", "thead", "tbody", "tfoot"],
  th: ["td", "th", "tr", "thead", "tbody", "tfoot"],
  tr: ["tr", "thead", "tbody", "tfoot"],
  thead: ["thead", "tbody", "tfoot"],
  tbody: ["thead", "tbody", "tfoot"],
  tfoot: ["thead", "tbody", "tfoot"],
};

/** 文字の大きさを変えるタグ（同じタグを重ねたら内側を外す。下限は CSS） */
export const SIZE_TAGS: ReadonlySet<string> = new Set(["small", "big", "sub", "sup", "tt", "kbd", "samp", "code", "rt"]);

/** 字下げになる入れ子（10 段まで）。字下げは ul・ol・blockquote・dd・figure の余白で付く（li・dl には付かない） */
export const INDENT_TAGS: ReadonlySet<string> = new Set(["ul", "ol", "blockquote", "dd", "figure"]);

/** 上限（超えたブロックは Markdown として描かずに、書いたままの文字で出す） */
export const HTML_LIMITS = { tags: 2000, depth: 32, indent: 10 } as const;

/** 制御文字・文字の並びを変える印・見えない文字（title などの文字から消す） */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;

/** 文字（制御文字を消し、max 字まで） */
const cleanText = (max: number) => (raw: string | null) => {
  if (raw === null) return null;
  const chars = Array.from(raw.replace(CONTROL_CHARS, ""));
  return chars.length > max ? chars.slice(0, max).join("") : chars.join("");
};

/** 範囲の中の整数（書き方は数字だけ。範囲の外・ほかの書き方は null） */
const integer = (min: number, max: number) => (raw: string | null) => {
  if (raw === null || !/^-?\d{1,5}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
};

/** 一覧の中の値（大文字・小文字を区別しない。小文字にして入れる） */
const oneOf = (values: readonly string[], caseSensitive = false) => (raw: string | null) => {
  if (raw === null) return null;
  const v = caseSensitive ? raw.trim() : raw.trim().toLowerCase();
  return values.includes(v) ? v : null;
};

/** リンクの行き先（Markdown のリンクと同じ判定 linkTargetOf。外のページは読み直した URL、# は ID を符号化し直したもの。ほかはリンクにしない） */
function href(raw: string | null): string | null {
  const target = linkTargetOf(raw);
  if (!target) return null;
  return target.kind === "web" ? target.url : `#${encodeURIComponent(target.id)}`;
}

/** 画像の src（http・https を書いたものだけ。//host は描く画面の出どころに左右されるので通さない） */
const imageSrc = (raw: string | null) => (raw === null || raw.startsWith("//") ? null : webLinkOf(raw));

type AttrValue = string | number | boolean;

/** 属性 1 つの決まり（prop は木の上の名前。parse が null なら属性を付けない） */
interface AttrRule {
  prop: string;
  /** 付けられるタグ（null はすべて） */
  tags: ReadonlySet<string> | null;
  parse: (raw: string | null) => AttrValue | null;
}

const tags = (names: string) => new Set(names.split(" "));
const present = () => true;

/** 通す属性（ほかはタグを描いたまま属性だけ消す。font は属性をすべて消す） */
export const HTML_ATTRIBUTES: Readonly<Record<string, AttrRule>> = {
  title: { prop: "title", tags: null, parse: cleanText(500) },
  lang: { prop: "lang", tags: null, parse: (raw) => (raw !== null && raw.length <= 35 && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(raw) ? raw : null) },
  id: { prop: "id", tags: null, parse: (raw) => (raw !== null && raw.length <= 100 && /^[A-Za-z0-9\-_.:]+$/.test(raw) ? `user-content-${raw}` : null) },
  href: { prop: "href", tags: tags("a"), parse: href },
  src: { prop: "src", tags: tags("img"), parse: imageSrc },
  alt: { prop: "alt", tags: tags("img"), parse: cleanText(500) },
  width: { prop: "width", tags: tags("img"), parse: integer(1, 2000) },
  open: { prop: "open", tags: tags("details"), parse: present },
  start: { prop: "start", tags: tags("ol"), parse: integer(-9999, 99999) },
  reversed: { prop: "reversed", tags: tags("ol"), parse: present },
  type: { prop: "type", tags: tags("ol"), parse: oneOf(["1", "a", "A", "i", "I"], true) },
  value: { prop: "value", tags: tags("li"), parse: integer(-9999, 99999) },
  colspan: { prop: "colSpan", tags: tags("td th"), parse: integer(1, 20) },
  scope: { prop: "scope", tags: tags("td th"), parse: oneOf(["row", "col", "rowgroup", "colgroup"]) },
  align: { prop: "align", tags: tags("p div h1 h2 h3 h4 h5 h6 td th tr"), parse: oneOf(["left", "center", "right", "justify"]) },
  span: { prop: "span", tags: tags("col colgroup"), parse: integer(1, 20) },
  datetime: { prop: "dateTime", tags: tags("time"), parse: cleanText(100) },
};

/** 木の上の名前 → 属性の名前（確かめで使う） */
export const ATTRIBUTE_BY_PROP: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(HTML_ATTRIBUTES).map(([name, rule]) => [rule.prop, name]));

/** タグ tag の属性 name（小文字）の値を読み直す。付けられない・値が決まりに合わなければ null */
export function attributeValue(tag: string, name: string, raw: string | null): { prop: string; value: AttrValue } | null {
  if (tag === "font" || !Object.hasOwn(HTML_ATTRIBUTES, name)) return null;
  const rule = HTML_ATTRIBUTES[name];
  if (rule.tags && !rule.tags.has(tag)) return null;
  const value = rule.parse(raw);
  return value === null ? null : { prop: rule.prop, value };
}
