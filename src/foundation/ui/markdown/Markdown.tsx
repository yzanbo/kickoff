import "./Markdown.css";
import "./MarkdownHtml.css";
import { Fragment, memo, useContext, useState } from "react";
import { createBlockSplitter, splitBlocks } from "@/foundation/ui/markdown/streaming/markdownBlocks";
import { splitTail } from "@/foundation/ui/markdown/streaming/streamReveal";
import { createBlockCache, pipelineOf, renderBlock } from "@/foundation/ui/markdown/markdownProcessor";
import { MarkdownFileLinksContext } from "@/foundation/ui/markdown/markdownFileLinks";
import { MarkdownImageSourcesContext, MarkdownImagesContext } from "@/foundation/ui/markdown/markdownImages";
import { RenderBoundary, RenderFailed } from "@/foundation/ui/kit/RenderBoundary";
import { convertTexDelimiters, mayContainMath } from "@shared/foundation/markdown/mathGuard";
import { useMathPlugins } from "@/foundation/ui/markdown/math/useMathPlugins";
import { OpenFence, StreamingFlag } from "./MarkdownCodeBlock";
import { COMPONENTS } from "./markdownComponents";

const NO_SOURCES: readonly string[] = [];

/** 描いたブロックの覚え（書きかけの返答から確定した返答に替わったとき・流れの窓で行を外して戻したときに解析し直さない） */
const blockCache = createBlockCache();

type MarkdownProps = { children: string; streaming?: boolean; tail?: readonly number[] };

/** 出たばかりの文字の段が同じか（段の配列は描くたびに作られるので中身で比べる） */
const sameTail = (a: readonly number[] | undefined, b: readonly number[] | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.length === b.length && a.every((n, i) => n === b[i]));

/**
 * AI の発言などの Markdown 表示（中の HTML は、安全と確かめた一覧のタグと属性だけを描き、ほかは文字のまま。`html/`）。本文と設定（streaming・tail）が同じなら描き直さない
 * （親が描き直るたびに全文を解析し直さないため。ファイルのリンクなど context の値が変わったときは描き直る）。```mermaid は図にする。
 * 数式（$$…$$・\(…\)・\[…\]・数式らしい $…$。`@shared/markdown/mathGuard`）は KaTeX で描く（数式の書き方を含むときだけ部品を読み込む）。
 * チャットのパネルの中（MarkdownFileLinksContext があるとき）は、作業場所のファイルのパスを押して開けるチップにする。
 * streaming: 生成中の返答。tail: 生成中に出たばかりの文字の数（出てからの時間で分けた段。新しい順。終わりの文字を段ごとに薄く出す。`useStreamReveal`）。
 * 文は空行で区切ったブロック（`streaming/markdownBlocks.ts`）に分け、ブロックごとに memo する。書いている途中は伸びる最後のブロックだけを解析し直し、
 * 書き終えたブロックは描いた要素を覚えから使い回す（作り置きの処理 `markdownProcessor.ts`）
 */
// 残す: tail を中身で比べる（React Compiler は比べ方を渡す memo を作れない）
export const Markdown = memo(MarkdownGuarded, (a, b) => a.children === b.children && a.streaming === b.streaming && sameTail(a.tail, b.tail));

/**
 * 描く処理が投げたら、このメッセージ（文）だけを「表示できませんでした」と元の文に替える（返答・ファイルのプレビュー・GitHub の本文などで共通。
 * ブロックの読み取りの失敗は markdownProcessor.ts がブロックごとに文字で出すので、ここで受けるのは部品の中の失敗）
 */
function MarkdownGuarded(props: MarkdownProps) {
  return (
    <RenderBoundary resetKey={props.children} fallback={<RenderFailed text={props.children} />}>
      <MarkdownBody {...props} />
    </RenderBoundary>
  );
}

function MarkdownBody({ children, streaming = false, tail }: MarkdownProps) {
  const links = useContext(MarkdownFileLinksContext);
  const images = useContext(MarkdownImagesContext);
  const hasMath = mayContainMath(children);
  const math = useMathPlugins(hasMath);
  const withMath = hasMath && math !== null;
  const pipeline = pipelineOf(links?.remarkPlugin, withMath ? math : null);
  // 書いている途中は、前の文の続きなら増えた行だけ読む読み取りを持つ
  const [splitter] = useState(createBlockSplitter);
  const text = withMath ? convertTexDelimiters(children) : children;
  const { blocks, openFence } = streaming ? splitter.split(text) : { blocks: splitBlocks(text), openFence: null };
  const tails = splitTail(
    blocks.map((b) => b.length),
    tail,
  );
  const last = blocks.length - 1;
  // 書き終えたブロックは覚えから引く（同じ要素なので React も描き直さない）。薄く出す段のあるブロックは毎回描く
  const rendered = blocks.map((b, i) => (tails[i] ? renderBlock(pipeline, b, COMPONENTS, tails[i]) : blockCache.render(pipeline, b, COMPONENTS)));
  // 画像の描き方を差し込まれているときだけ、描く木の画像の src を配る（「host から画像を n 件表示」の数。HTML の img も入る）
  const sources = images ? rendered.flatMap((r) => r.images) : NO_SOURCES;
  return (
    <div className="markdown">
      <MarkdownImageSourcesContext.Provider value={sources}>
        <StreamingFlag.Provider value={streaming}>
          {/* ブロックの間には、全文を 1 度に描いたときと同じく改行の文字を置く（HTML を文字で出す所の間の空白・選んでコピーした文を変えない） */}
          {rendered.map((block, i) => (
            <Fragment key={i}>
              {i > 0 && "\n"}
              {/* 形をそろえて包む（最後のブロックが前のブロックになっても作り直さない） */}
              <OpenFence.Provider value={i === last ? openFence : null}>
                {block.element}
              </OpenFence.Provider>
            </Fragment>
          ))}
        </StreamingFlag.Provider>
      </MarkdownImageSourcesContext.Provider>
    </div>
  );
}
