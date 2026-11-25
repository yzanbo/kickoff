/**
 * Markdown を React の要素にする処理（react-markdown 10.1.0 の Markdown と同じ手順を、unified の processor を作り置きにして行う）。
 * react-markdown は描くたびに processor を組み立て直すので、ブロックに分けて描くと
 * その手間がブロックの数だけ増える。作り置きにすれば、分けても全体の手間は増えない。
 *
 * react-markdown の中身（公開されていない createProcessor・post）を写している。package.json で react-markdown と写した道具
 * （unified・remark-parse・remark-rehype・hast-util-to-jsx-runtime・html-url-attributes・unist-util-visit・vfile）の版を固定してあり、
 * 上げるときは markdownProcessor.test.ts（react-markdown そのものと描いた結果が等しいこと）を必ず流す
 */
import type { Root as HastRoot, Nodes } from "hast";
import type { Root as MdastRoot } from "mdast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { urlAttributes } from "html-url-attributes";
import type { ReactElement } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { defaultUrlTransform, type Components, type Options } from "react-markdown";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Processor } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import { createLruMap, type LruMap } from "@/foundation/ui/lib/lruMap";
import { wrapStreamTail } from "@/foundation/ui/markdown/streaming/streamReveal";
import { isRiskyMarkdownBlock } from "./markdownGuard";
import { markdownRemarkPlugins, REMARK_REHYPE_OPTIONS } from "./syntax/markdownPlugins";

type PluggableList = NonNullable<Options["remarkPlugins"]>;

/** 作り置きの処理の組（同じプラグインの組なら同じ物） */
export interface MarkdownPipeline {
  /** ブロックの覚えの鍵に入れる番号 */
  id: number;
  /** remark-parse → remark のプラグイン → remark-rehype（`REMARK_REHYPE_OPTIONS`。生の HTML は react-markdown と同じく木に残す） */
  toHast: Processor<MdastRoot, MdastRoot, HastRoot>;
  /** rehype のプラグイン（数式のときの rehype-katex など。なければ null） */
  rehype: Processor<undefined, HastRoot, HastRoot> | null;
}

let nextId = 1;

/** remark・rehype のプラグインの組から処理を作る（作り置きは呼ぶ側。pipelineOf） */
export function createPipeline(remarkPlugins: PluggableList, rehypePlugins: PluggableList): MarkdownPipeline {
  const toHast = unified().use(remarkParse).use(remarkPlugins).use(remarkRehype, REMARK_REHYPE_OPTIONS).freeze();
  const rehype = rehypePlugins.length ? unified().use(rehypePlugins).freeze() : null;
  return { id: nextId++, toHast: toHast as unknown as MarkdownPipeline["toHast"], rehype: rehype as unknown as MarkdownPipeline["rehype"] };
}

/** 数式の部品（remark-math・rehype-katex と KaTeX の CSS・フォント。useMathPlugins の値） */
export interface MathPlugins {
  remark: PluggableList;
  rehype: PluggableList;
}

// ファイルのチップの差し込み（作業場所ごとに同じ物）× 数式の有無ごとに 1 つだけ作る
const byLinks = new WeakMap<object, Map<MathPlugins | null, MarkdownPipeline>>();
const noLinks = new Map<MathPlugins | null, MarkdownPipeline>();

/**
 * Markdown の部品が使う処理の組: 読み方の設定の組（`syntax/markdownPlugins.ts`）に、数式（読み込んであれば）・ファイルのチップの差し込みを足す。
 * rehype は数式のときだけ rehype-katex（react-markdown に渡すときと同じ順）
 */
export function pipelineOf(links: PluggableList[number] | undefined, math: MathPlugins | null): MarkdownPipeline {
  const table = links && typeof links === "object" ? (byLinks.get(links) ?? new Map<MathPlugins | null, MarkdownPipeline>()) : noLinks;
  if (links && typeof links === "object") byLinks.set(links, table);
  let pipeline = table.get(math);
  if (!pipeline) {
    pipeline = createPipeline(markdownRemarkPlugins([...(math ? math.remark : []), ...(links ? [links] : [])]), math ? math.rehype : []);
    table.set(math, pipeline);
  }
  return pipeline;
}

/**
 * 1 つのブロック（か全文）を、描く前の hast にする（生の HTML は文字にし、URL は安全にしたもの。`sanitizeHast`）。
 * tail（出たばかりの文字の段）があれば、木の終わりの文字を薄く包んでから rehype に渡す
 * （数式の要素は KaTeX が丸ごと置き換えるので、その前に包む。前の rehypeStreamTail と同じ順）。
 * 読むと危ない形（`isRiskyMarkdownBlock`。固まる・スタックがあふれる）と、読む途中で投げたときは null（書いたままの文字で出す。呼ぶ側）
 */
export function markdownToHast(pipeline: MarkdownPipeline, text: string, tail?: readonly number[]): HastRoot | null {
  if (isRiskyMarkdownBlock(text)) return null;
  try {
    const file = new VFile(text);
    let tree = pipeline.toHast.runSync(pipeline.toHast.parse(file), file);
    if (tail?.some((n) => n > 0)) wrapStreamTail(tree, tail);
    if (pipeline.rehype) tree = pipeline.rehype.runSync(tree, file);
    return sanitizeHast(tree);
  } catch {
    return null;
  }
}

/**
 * 1 つのブロック（か全文）を要素にする（`markdownToHast`）。読めなかったブロックは、書いたままの文字で出す
 * （そのブロックだけ。開くたびに同じ文を描くので、投げたままにするとそのチャット・ファイルが開けなくなる）
 */
export function renderMarkdown(pipeline: MarkdownPipeline, text: string, components: Components, tail?: readonly number[]): ReactElement {
  const tree = markdownToHast(pipeline, text, tail);
  if (!tree) return plainBlock(text);
  return toJsxRuntime(tree, { Fragment, components, ignoreInvalidStyle: true, jsx, jsxs, passKeys: true, passNode: true }) as ReactElement;
}

/** Markdown として読まずに、書いたままの文字で出すブロック（改行もそのまま。Markdown.css の .markdown-plain） */
const plainBlock = (text: string): ReactElement => jsx("p", { className: "markdown-plain", children: text });

/** HTML のコメントだけ（前後の空白と、続けて並んだ複数のコメントは含む）の文か */
const HTML_COMMENT_ONLY = /^\s*(?:<!--(?:(?!-->)[\s\S])*-->\s*)+$/;

/** raw（生の HTML）の文が HTML のコメントだけか（`<!-- visual: v-… -->` のような目印。HTML として描いても何も出ないもの） */
export const isHtmlComment = (value: string) => HTML_COMMENT_ONLY.test(value);

/**
 * react-markdown の post と同じ: raw（HTML）を文字にし、URL を安全にする（defaultUrlTransform。その場で書き換える）。
 * ただし HTML のコメントだけの raw は文字にせず消す（HTML として描いても出ないものなので。ほかの生の HTML は動かさずに文字で出す）
 */
function sanitizeHast(tree: HastRoot): HastRoot {
  visit(tree, (node: Nodes, index, parent) => {
    if (node.type === "raw" && parent && typeof index === "number") {
      if (isHtmlComment(node.value)) parent.children.splice(index, 1);
      else parent.children[index] = { type: "text", value: node.value };
      return index;
    }
    if (node.type === "element") {
      for (const key in urlAttributes) {
        if (Object.hasOwn(urlAttributes, key) && Object.hasOwn(node.properties, key)) {
          const test = urlAttributes[key];
          if (test === null || test.includes(node.tagName)) node.properties[key] = defaultUrlTransform(String(node.properties[key] || ""));
        }
      }
    }
    return undefined;
  });
  return tree;
}

/** ブロックの覚えの上限（要素は hast の節を props に持つので、数と文の長さの両方で抑える） */
const BLOCK_CACHE_LIMITS = { count: 1000, chars: 500_000 };

/** 描いたブロックの覚え（鍵は処理の組の番号と文） */
export interface BlockCache {
  render(pipeline: MarkdownPipeline, text: string, components: Components): ReactElement;
}

/**
 * ブロックの覚えを作る。書きかけの返答から確定した返答に替わったとき・流れの窓で行を外して戻したときに、同じ文のブロックを解析し直さない
 * （薄く出す段のあるブロックは覚えない。呼ぶ側で renderMarkdown を直接呼ぶ）
 */
export function createBlockCache(limits = BLOCK_CACHE_LIMITS): BlockCache {
  const cache: LruMap<string, ReactElement> = createLruMap(limits.count, { maxWeight: limits.chars, weigh: (_v, key) => key.length });
  return {
    render(pipeline, text, components) {
      const key = `${pipeline.id}\u0000${text}`;
      let element = cache.get(key);
      if (!element) {
        element = renderMarkdown(pipeline, text, components);
        cache.set(key, element);
      }
      return element;
    },
  };
}
