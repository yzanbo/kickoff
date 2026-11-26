// Markdown の中の HTML を、描く前の木（hast）の要素にする。開きと閉じが同じ親（同じ段落・同じ項目・同じ階層）の中でそろったものだけを要素にし、
// そろわない開き・閉じは書いたままの文字で出す（閉じていない <a>・<details> が、後ろの文や箇条書きの次の項目を巻き込まない）。
// 補う決まりを持たないので、節の数は入力の長さに比例するだけ（閉じていないタグを並べても膨らまない）
import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import {
  ALLOWED_CHILDREN,
  attributeValue,
  HTML_LIMITS,
  IMPLIED_END,
  INDENT_TAGS,
  PHRASING_ONLY_PARENTS,
  PHRASING_TAGS,
  PICTURE_ONLY,
  REQUIRED_PARENT,
  SIZE_TAGS,
  TEXT_ONLY_TAGS,
  VOID_TAGS,
} from "./htmlAllowlist";
import { tokenizeHtml, type HtmlToken } from "./htmlTokens";

declare module "hast" {
  interface ElementData {
    /** Markdown の中の HTML から作った要素（確かめ htmlVerify.ts の相手。Markdown・ファイルのチップ・数式が作った要素には付かない） */
    kickoffHtml?: true;
  }
}

type StartToken = Extract<HtmlToken, { type: "start" }>;

/** 開きと閉じがそろった HTML の要素（親の中の位置が決まってから要素にする。materialize） */
interface Built {
  type: "built";
  name: string;
  token: StartToken;
  children: Child[];
  /** 閉じのタグの書いたままの文字（閉じを省いたもの・閉じの要らないものは空） */
  end: string;
}
/** そろわなかったタグの中身（親へ写さずにまとめて置き、要素にするときに 1 回だけ広げる。閉じないタグを重ねても写す手間が 2 乗にならないように） */
interface Group {
  type: "group";
  children: Child[];
}
type Child = ElementContent | Built | Group;

/** 開いたままのタグ */
interface Frame {
  name: string;
  token: StartToken | null;
  children: Child[];
  /** pre・code（中のタグを描かず文字だけにする） */
  textOnly: boolean;
  /** 段落・文の中のタグ（中に段落などを置けない） */
  phrasingOnly: boolean;
}

/** 上限を超えた（ブロックを書いたままの文字で出す） */
class OverLimit extends Error {}

const text = (value: string): Text => ({ type: "text", value });
const isBlank = (child: Child) => child.type === "text" && child.value.trim() === "";
const isFlow = (node: ElementContent) => node.type === "element" && !PHRASING_TAGS.has(node.tagName);

/** 要素の中の文字（pre・code の中に入った Markdown の要素は、文字だけにする） */
const textOf = (node: ElementContent): string => (node.type === "text" ? node.value : node.type === "element" ? node.children.map(textOf).join("") : "");

/** HTML のコメントだけ（空白と、続けて並んだコメントは含む）の文。画面に何も出ないものなので消す */
const HTML_COMMENT_ONLY = /^\s*(?:<!--(?:(?!-->)[\s\S])*-->\s*)+$/;
export const isHtmlComment = (value: string) => HTML_COMMENT_ONLY.test(value);

/** 1 つの親の子を読み、raw（HTML の文）を要素と文字にした子を返す（parentName は親のタグの名前。root は ""） */
function buildLevel(children: readonly (RootContent | ElementContent)[], parentName: string, counter: { tags: number }): ElementContent[] {
  const base: Frame = { name: parentName, token: null, children: [], textOnly: false, phrasingOnly: PHRASING_ONLY_PARENTS.has(parentName) };
  const stack: Frame[] = [base];
  const top = () => stack[stack.length - 1];
  const push = (child: Child) => top().children.push(child);
  // 閉じた（そろった）
  const closeTop = (end: string) => {
    const frame = stack.pop() as Frame & { token: StartToken };
    push({ type: "built", name: frame.name, token: frame.token, children: frame.children, end });
  };
  // そろわなかった: 開きのタグは文字にして、中身は親へ
  const flattenTop = () => {
    const frame = stack.pop() as Frame & { token: StartToken };
    top().children.push(text(frame.token.source), { type: "group", children: frame.children });
  };

  const onStart = (t: StartToken) => {
    const current = top();
    if (current.textOnly) {
      // pre のすぐ内側の code だけは要素にする（中は同じく文字だけ）
      if (current.name === "pre" && t.name === "code" && !t.selfClosing && current.children.length === 0) stack.push({ name: "code", token: t, children: [], textOnly: true, phrasingOnly: true });
      else push(text(t.source));
      return;
    }
    if (t.name === PICTURE_ONLY) {
      if (current.name !== "picture") push(text(t.source));
      return;
    }
    if (!VOID_TAGS.has(t.name) && t.selfClosing) return push(text(t.source));
    while (IMPLIED_END[top().name]?.includes(t.name) && stack.length > 1) closeTop("");
    const parent = top();
    const allowed = ALLOWED_CHILDREN[parent.name];
    // 文の中にしか置けない所には文の中のタグだけ（ruby の中の rt・rp のように、決まった親の中の部品はよい）
    const ownPart = REQUIRED_PARENT[t.name]?.includes(parent.name) ?? false;
    if ((parent.phrasingOnly && !PHRASING_TAGS.has(t.name) && !ownPart) || (allowed && !allowed.includes(t.name))) return push(text(t.source));
    if (VOID_TAGS.has(t.name)) return push({ type: "built", name: t.name, token: t, children: [], end: "" });
    stack.push({ name: t.name, token: t, children: [], textOnly: TEXT_ONLY_TAGS.has(t.name), phrasingOnly: PHRASING_ONLY_PARENTS.has(t.name) });
  };

  const onEnd = (t: Extract<HtmlToken, { type: "end" }>) => {
    const current = top();
    if (VOID_TAGS.has(t.name)) return push(text(t.source));
    // pre・code の中は、自分の閉じ（code の中の </pre> も）だけを読む
    if (current.textOnly && t.name !== current.name && !(t.name === "pre" && stack[stack.length - 2]?.name === "pre")) return push(text(t.source));
    let k = stack.length - 1;
    while (k > 0 && stack[k].name !== t.name) k--;
    if (k === 0) return push(text(t.source));
    while (stack.length - 1 > k) {
      if (IMPLIED_END[top().name]) closeTop("");
      else flattenTop();
    }
    closeTop(t.source);
  };

  const onNode = (node: ElementContent) => {
    if (top().textOnly) return push(text(textOf(node)));
    // 段落などのブロックは、文の中のタグ・段落・見出しの中に入れない（そろわなかったものとして文字にする）
    if (isFlow(node)) while (top().phrasingOnly && stack.length > 1) flattenTop();
    push(node);
  };

  for (const node of children) {
    if (node.type === "doctype") continue;
    if (node.type !== "raw") {
      onNode(node);
      continue;
    }
    if (isHtmlComment(node.value)) continue;
    const tokens = tokenizeHtml(node.value);
    const tags = tokens.filter((t) => t.type === "start" || t.type === "end").length;
    // 一覧のタグを含まないもの（Promise<S>・<Button> など）は、書いたままの文字
    if (tags === 0) {
      onNode(text(node.value));
      continue;
    }
    counter.tags += tags;
    if (counter.tags > HTML_LIMITS.tags) throw new OverLimit();
    for (const t of tokens) {
      if (t.type === "start") onStart(t);
      else if (t.type === "end") onEnd(t);
      else if (t.type === "comment") push(text(t.source));
      else push(text(t.value));
    }
  }
  while (stack.length > 1) flattenTop();
  return materialize(base.children, parentName);
}

/** 入れ物の子が決まりどおりか（ul の子は li だけ、など。空白の文字はよい） */
function childrenFit(b: Built): boolean {
  const allowed = ALLOWED_CHILDREN[b.name];
  return !allowed || b.children.every((c) => isBlank(c) || (c.type === "built" && allowed.includes(c.name)));
}

/**
 * 開きと閉じのそろったものを、親の中の位置で確かめて要素にする。置けない所のものは、書いたままの文字に戻す。
 * 外した要素・そろわなかった中身は同じ out へ書く（入れ子の分だけ配列を写し直さない）
 */
function materialize(children: Child[], parentName: string, out: ElementContent[] = []): ElementContent[] {
  let significant = 0;
  for (const child of children) {
    if (child.type === "group") {
      materialize(child.children, parentName, out);
      significant++;
      continue;
    }
    if (child.type !== "built") {
      out.push(child);
      if (!isBlank(child)) significant++;
      continue;
    }
    const required = REQUIRED_PARENT[child.name];
    const fits =
      (!required || required.includes(parentName)) &&
      !(PHRASING_ONLY_PARENTS.has(parentName) && !PHRASING_TAGS.has(child.name) && !required?.includes(parentName)) &&
      // summary は details の最初の子だけ
      !(child.name === "summary" && significant > 0) &&
      // 画像は src（http・https）のあるものだけ
      !(child.name === "img" && !child.token.attrs.some(([name, raw]) => name === "src" && attributeValue("img", name, raw))) &&
      childrenFit(child);
    significant++;
    if (!fits) {
      out.push(text(child.token.source));
      materialize(child.children, parentName, out);
      if (child.end) out.push(text(child.end));
    } else if (child.name === "picture") {
      materialize(child.children, parentName, out);
    } else if (child.name !== "rp") {
      out.push(elementOf(child));
    }
  }
  return out;
}

/** 要素にする（属性は一覧の決まりで読み直したものだけ） */
function elementOf(b: Built): Element {
  const properties: Element["properties"] = {};
  for (const [name, raw] of b.token.attrs) {
    const attr = attributeValue(b.name, name, raw);
    if (attr) properties[attr.prop] = attr.value;
  }
  const children = materialize(b.children, b.name);
  // HTML と同じく、<pre> のすぐ後ろの改行は中身に入れない
  const first = children[0];
  if (b.name === "pre" && first?.type === "text" && first.value.startsWith("\n")) children[0] = text(first.value.slice(1));
  return { type: "element", tagName: b.name, properties, children, data: { kickoffHtml: true } };
}

/** 子から順に、どの親の raw も要素と文字にする */
function buildTree(parent: Root | Element, counter: { tags: number }) {
  for (const child of parent.children) if (child.type === "element") buildTree(child, counter);
  if (parent.children.some((c) => c.type === "raw")) parent.children = buildLevel(parent.children, parent.type === "root" ? "" : parent.tagName, counter);
}

/**
 * 木全体の仕上げ: リンクの中のリンク・同じ大きさのタグの重なりは内側を外す。入れ子の段数を数え、上限を超えたら false。
 * Markdown だけの深い入れ子も同じ上限で止める
 */
function finishTree(parent: Root | Element, depth: number, indent: number, inside: ReadonlySet<string>): boolean {
  const next: ElementContent[] = [];
  let changed = false;
  for (const child of parent.children as ElementContent[]) {
    if (child.type !== "element") {
      next.push(child);
      continue;
    }
    const tag = child.tagName;
    if ((tag === "a" || SIZE_TAGS.has(tag)) && inside.has(tag)) {
      // 外した要素の中身は、同じ段でもう一度確かめる
      const wrapper: Element = { type: "element", tagName: "div", properties: {}, children: child.children };
      if (!finishTree(wrapper, depth, indent, inside)) return false;
      next.push(...wrapper.children);
      changed = true;
      continue;
    }
    const childIndent = indent + (INDENT_TAGS.has(tag) ? 1 : 0);
    if (depth + 1 > HTML_LIMITS.depth || childIndent > HTML_LIMITS.indent) return false;
    const nested = tag === "a" || SIZE_TAGS.has(tag) ? new Set([...inside, tag]) : inside;
    if (!finishTree(child, depth + 1, childIndent, nested)) return false;
    next.push(child);
  }
  if (changed) parent.children = next;
  return true;
}

/**
 * hast の raw（Markdown の中の HTML）を要素と文字にする（その場で書き換える）。
 * 1 ブロックのタグが 2,000 個・要素の入れ子が 32 段・字下げの入れ子が 10 段を超えたら false（呼ぶ側が書いたままの文字で出す）
 */
export function buildHtml(tree: Root): boolean {
  try {
    buildTree(tree, { tags: 0 });
  } catch (error) {
    if (error instanceof OverLimit) return false;
    throw error;
  }
  return finishTree(tree, 0, 0, new Set());
}
