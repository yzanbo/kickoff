/**
 * URL の自動リンク（GFM の autolink literal）を、日本語の文の記号・ひらがななど（`urlStop.ts`）の手前で終える版。
 * GFM の自動リンクは 2 か所で作られるので、両方で同じ文字の手前で止める:
 * - 読み取りの段（micromark-extension-gfm-autolink-literal 2.1.0）: ここで止めると、切れたあとの文がふつうの文として読み直される
 *   （**詳細（https://example.com）**です の ）** が太字の閉じになる。読み取ったリンクをあとで切るだけでは太字が直らない）
 * - mdast の段（mdast-util-gfm-autolink-literal 2.0.1 の findAndReplace。読み取りの段が拾わない「www.…」などを文から探す）
 * どちらも元の部品をそのまま使い、止まる文字の所でだけ振る舞いを変える（中の決まりに頼るので、版は package.json で固定してある）
 */
import type { Root, RootContent, Text } from "mdast";
import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import type { Code, Construct, ConstructRecord, Effects, Extension, State, Tokenizer } from "micromark-util-types";
import { isUrlStop, URL_STOP_CLASS } from "./urlStop";

/** 空白の文字（micromark の文字の番号） */
const SPACE = 32;
/** 止めるのは URL の 2 つ（メールの形はいまも正しく切れるのでそのまま） */
const URL_CONSTRUCTS = new Set(["protocolAutolink", "wwwAutolink"]);

/**
 * 止まる文字を、空白として読ませる読み取り。元の読み取りは、URL の中で空白を見ると、その文字を読み進めずに「ここで終わり」（ok / nok）を返す
 * （ドメイン・パス・末尾の記号のどの段でも。中で試す段（attempt・check）の ok / nok も同じ）。
 * 差し替えた文字のまま ok / nok に渡すと micromark の確かめに当たるので、ok / nok には本当の文字を渡し直す。
 * micromark は読み進めなかった文字を次の読み取りに渡し直すので、読み取りの位置と後ろの文はずれない。
 * 自分の ok / nok が呼ばれたら、そこから先（後ろの文の読み取り）は差し替えない
 */
function stopAtUrlStop(construct: Construct): Construct {
  const tokenize: Tokenizer = function (effects, ok, nok) {
    let done = false;
    // いま空白に差し替えている本当の文字（差し替えていなければ null）
    let real: Code = null;
    const restore =
      (next: State): State =>
      (code) =>
        next(real !== null && code === SPACE ? real : code);
    const finish =
      (next: State): State =>
      (code) => {
        done = true;
        return restore(next)(code);
      };
    const wrap =
      (state: State): State =>
      (code) => {
        let next: State | undefined;
        if (isUrlStop(code)) {
          real = code;
          next = state(SPACE);
          real = null;
        } else next = state(code);
        return done || !next ? next : wrap(next);
      };
    // 中で試す段（とその中の段）の ok / nok にも本当の文字を渡し直す
    const inner = (c: Construct | Construct[] | ConstructRecord): Construct | Construct[] | ConstructRecord => {
      if (Array.isArray(c)) return c.map((one) => inner(one) as Construct);
      if (typeof (c as Construct).tokenize !== "function") return c;
      const part = c as Construct;
      return {
        ...part,
        tokenize(innerEffects, innerOk, innerNok) {
          return part.tokenize.call(this, hook(innerEffects), restore(innerOk), restore(innerNok));
        },
      };
    };
    const hook = (e: Effects): Effects => ({
      ...e,
      attempt: (c, returnState, bogusState) => e.attempt(inner(c), returnState, bogusState),
      check: (c, returnState, bogusState) => e.check(inner(c), returnState, bogusState),
      interrupt: (c, returnState, bogusState) => e.interrupt(inner(c), returnState, bogusState),
    });
    return wrap(construct.tokenize.call(this, hook(effects), finish(ok), finish(nok)));
  };
  return { ...construct, tokenize };
}

/** 読み取りの段: 元の拡張の URL の読み取りだけを差し替えたもの */
export function gfmAutolinkSyntax(): Extension {
  const original = gfmAutolinkLiteral();
  const wrapped = new Map<Construct, Construct>();
  const swap = (c: Construct) => {
    if (!c.name || !URL_CONSTRUCTS.has(c.name)) return c;
    let w = wrapped.get(c);
    if (!w) wrapped.set(c, (w = stopAtUrlStop(c)));
    return w;
  };
  const text: ConstructRecord = {};
  for (const [code, value] of Object.entries(original.text ?? {})) {
    if (value) text[Number(code)] = Array.isArray(value) ? value.map(swap) : swap(value as Construct);
  }
  return { ...original, text };
}

/** 文の中の URL らしい所（元の findAndReplace の URL の頭から、空白か止まる文字の手前まで） */
const URL_RUN = new RegExp(`(?:https?://|www\\.)[^ \\t\\r\\n${URL_STOP_CLASS}]*`, "giu");

type Parent = { children: RootContent[] };

/** 分けた節（piece）と、分ける前の節 */
type Pieces = Map<Text, Text>;

/** URL らしい所のすぐ後ろが止まる文字なら、その手前の位置（文字の節を分ける所） */
function cutsOf(value: string): number[] {
  const cuts: number[] = [];
  for (const m of value.matchAll(URL_RUN)) {
    const end = m.index + m[0].length;
    if (end < value.length && isUrlStop(value.codePointAt(end) ?? null)) cuts.push(end);
  }
  return cuts;
}

/**
 * 文字の節を、URL らしい所の後ろの止まる文字の手前で分ける（元の findAndReplace は 1 つの節の中だけで URL を探すので、分けた所を越えない）。
 * リンクの中は探さない（元と同じ）
 */
function splitAtStops(parent: Parent, pieces: Pieces) {
  parent.children = parent.children.flatMap((child): RootContent[] => {
    if (child.type !== "text") {
      if ("children" in child && child.type !== "link" && child.type !== "linkReference") splitAtStops(child as Parent, pieces);
      return [child];
    }
    const cuts = cutsOf(child.value);
    if (cuts.length === 0) return [child];
    return [0, ...cuts].map((from, i) => {
      const piece: Text = { type: "text", value: child.value.slice(from, cuts[i]) };
      pieces.set(piece, child);
      return piece;
    });
  });
}

/**
 * 分けた節のうち、URL にならずに隣り合って残ったものを 1 つに戻す（ほかの段に、分ける前と同じ木を渡す）。
 * 1 つの節の分けたものがすべて残っていれば、元の節（位置を持つ）に戻す
 */
function joinPieces(parent: Parent, pieces: Pieces) {
  const out: RootContent[] = [];
  for (const child of parent.children) {
    const last = out.at(-1);
    const from = child.type === "text" ? pieces.get(child) : undefined;
    if (child.type === "text" && from && last?.type === "text" && pieces.get(last) === from) {
      const joined: Text = { type: "text", value: last.value + child.value };
      // 元の節の文がそろったら元の節に戻す（位置を保つ）
      const whole = joined.value === from.value ? from : joined;
      if (whole !== from) pieces.set(whole, from);
      out[out.length - 1] = whole;
      continue;
    }
    if ("children" in child) joinPieces(child as Parent, pieces);
    out.push(child);
  }
  parent.children = out;
}

/** mdast の段: 元の組み立て（読み取った URL を link の節にする）と、止まる文字を越えない文の中の URL 探し */
export function gfmAutolinkFromMarkdown(): ReturnType<typeof gfmAutolinkLiteralFromMarkdown> {
  const original = gfmAutolinkLiteralFromMarkdown();
  // 分けた節の印（木ごと。文の中の URL 探しの前に分け、あとで戻す）
  const byTree = new WeakMap<Root, Pieces>();
  const split = (tree: Root) => {
    const pieces: Pieces = new Map();
    byTree.set(tree, pieces);
    splitAtStops(tree, pieces);
  };
  const join = (tree: Root) => {
    const pieces = byTree.get(tree);
    if (pieces?.size) joinPieces(tree, pieces);
  };
  return { ...original, transforms: [split, ...(original.transforms ?? []), join] };
}
