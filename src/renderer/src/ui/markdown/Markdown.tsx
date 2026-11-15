import { createContext, Fragment, memo, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { createBlockSplitter, splitBlocks } from "@/lib/markdownBlocks";
import { splitTail } from "@/lib/streamReveal";
import { createBlockCache, pipelineOf, renderMarkdown, type MarkdownPipeline } from "./markdownProcessor";
import { MarkdownFileLinksContext } from "./markdownFileLinks";
import { MermaidDiagram, MermaidPlaceholder } from "@/ui/markdown/mermaid/MermaidDiagram";
import { codeBlockOf } from "@/ui/markdown/mermaid/mermaidSource";
import { CopyButton } from "@/ui/CopyButton";
import { convertTexDelimiters, mayContainMath } from "@shared/markdown/mathGuard";
import { useMathPlugins } from "@/ui/markdown/math/useMathPlugins";

/** リンク。ファイルのパスらしいもの（MarkdownFileLinks の remark のプラグインが data-file-path を付けたもの）は、開けるファイルなら押して開けるチップにする */
const link: Components["a"] = ({ node, href, children }) => {
  const path = node?.properties.dataFilePath;
  const plain = (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
  if (typeof path !== "string") return plain;
  const text = node?.properties.dataFileText;
  return (
    <FileLink path={path} line={Number(node?.properties.dataFileLine) || undefined} text={typeof text === "string" ? text : undefined} fallback={href ? plain : children}>
      {children}
    </FileLink>
  );
};

const noSubscribe = () => () => {};

/**
 * 押すとファイルを開くチップ（中はインラインコードかリンクの文字。開き方・右クリックのメニューは渡す側が決める）。
 * 開けるか（一覧にあるか・どのファイルか）は、一覧の店から自分のパスの結果だけを選んで読む（一覧が変わっても、結果の変わったチップだけが描き直る）。
 * 開けなければ元のまま（fallback。地の文の絶対パスは元の文字 text）
 */
function FileLink({ path: candidate, line, text, fallback, children }: { path: string; line?: number; text?: string; fallback: ReactNode; children: ReactNode }) {
  const links = useContext(MarkdownFileLinksContext);
  const path = useSyncExternalStore(links?.subscribe ?? noSubscribe, () => links?.resolve(candidate));
  if (!links || path === undefined) return <>{text ?? fallback}</>;
  // 地の文の絶対パスは、引き当てたパスをコードの見た目で出す
  const label = text !== undefined ? <code>{line ? `${path}:${line}` : path}</code> : children;
  return (
    <button
      type="button"
      className="file-link"
      title={links.title(path, line)}
      onClick={(e) => links.open(e, path, line)}
      onContextMenu={(e) => {
        // 返答の右クリックのメニュー（メッセージをコピー）ではなく、ファイルのメニューを出す
        e.stopPropagation();
        links.menu(e, path, line);
      }}
    >
      {label}
    </button>
  );
}

/** 書いている途中の返答の中か（コードブロックの部品が読む。途中と確定で同じ要素を使い回すため、部品に閉じ込めない） */
const StreamingFlag = createContext(false);

/**
 * コードブロック。上の帯に言語名とコピーのボタンを出す（ボタンはいつも出す）。
 * ```mermaid は図にする（生成中は、書きかけの図を描かずに枠だけ出す）
 */
const codeBlock: Components["pre"] = function CodeBlock({ node, ...props }) {
  const streaming = useContext(StreamingFlag);
  const block = codeBlockOf(node);
  if (block?.language === "mermaid") return streaming ? <MermaidPlaceholder /> : <MermaidDiagram code={block.text} />;
  if (!block) return <pre {...props} />;
  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-block-lang">{block.language}</span>
        <CopyButton text={block.text} label="コードをコピー" className="code-block-copy" />
      </div>
      <pre {...props} />
    </div>
  );
};

/** 表。幅が広いときは外枠を横スクロールにして、欄からはみ出さないようにする */
const table: Components["table"] = ({ node: _node, ...props }) => (
  <div className="markdown-table">
    <table {...props} />
  </div>
);

// 描くたびに部品が作り直されないよう（図の状態が消えないよう）、外で作っておく
const COMPONENTS: Components = { a: link, pre: codeBlock, table };

/** 描いたブロックの覚え（書きかけの返答から確定した返答に替わったとき・流れの窓で行を外して戻したときに解析し直さない） */
const blockCache = createBlockCache();

type MarkdownProps = { children: string; streaming?: boolean; tail?: readonly number[] };

/** 出たばかりの文字の段が同じか（段の配列は描くたびに作られるので中身で比べる） */
const sameTail = (a: readonly number[] | undefined, b: readonly number[] | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.length === b.length && a.every((n, i) => n === b[i]));

/**
 * AI の発言などの Markdown 表示（HTML は描画しない）。本文と設定（streaming・tail）が同じなら描き直さない
 * （親が描き直るたびに全文を解析し直さないため。ファイルのリンクなど context の値が変わったときは描き直る）。```mermaid は図にする。
 * 数式（$$…$$・\(…\)・\[…\]・数式らしい $…$。`@shared/markdown/mathGuard`）は KaTeX で描く（数式の書き方を含むときだけ部品を読み込む）。
 * チャットのパネルの中（MarkdownFileLinksContext があるとき）は、作業場所のファイルのパスを押して開けるチップにする。
 * streaming: 生成中の返答。tail: 生成中に出たばかりの文字の数（出てからの時間で分けた段。新しい順。終わりの文字を段ごとに薄く出す。`useStreamReveal`）。
 * 文は空行で区切ったブロック（`lib/markdownBlocks.ts`）に分け、ブロックごとに memo する。書いている途中は伸びる最後のブロックだけを解析し直し、
 * 書き終えたブロックは描いた要素を覚えから使い回す（作り置きの処理 `markdownProcessor.ts`。メモの仕様書「0023_表示を軽くする」の案 15）
 */
export const Markdown = memo(MarkdownBody, (a, b) => a.children === b.children && a.streaming === b.streaming && sameTail(a.tail, b.tail));

function MarkdownBody({ children, streaming = false, tail }: MarkdownProps) {
  const links = useContext(MarkdownFileLinksContext);
  const hasMath = mayContainMath(children);
  const math = useMathPlugins(hasMath);
  const withMath = hasMath && math !== null;
  const pipeline = pipelineOf(links?.remarkPlugin, withMath ? math : null);
  // 書いている途中は、前の文の続きなら増えた行だけ読む読み取りを持つ
  const [splitter] = useState(createBlockSplitter);
  const text = useMemo(() => (withMath ? convertTexDelimiters(children) : children), [children, withMath]);
  const blocks = useMemo(() => (streaming ? splitter.split(text).blocks : splitBlocks(text)), [text, streaming, splitter]);
  const tails = splitTail(
    blocks.map((b) => b.length),
    tail,
  );
  return (
    <div className="markdown">
      <StreamingFlag.Provider value={streaming}>
        {/* ブロックの間には、全文を 1 度に描いたときと同じく改行の文字を置く（HTML を文字で出す所の間の空白・選んでコピーした文を変えない） */}
        {blocks.map((b, i) => (
          <Fragment key={i}>
            {i > 0 && "\n"}
            <MarkdownBlock pipeline={pipeline} text={b} tail={tails[i]} />
          </Fragment>
        ))}
      </StreamingFlag.Provider>
    </div>
  );
}

/** 1 つのブロック。文・処理の組・薄く出す段が同じなら描き直さない。薄く出す段がなければ、描いた要素を覚えから引く */
const MarkdownBlock = memo(
  function MarkdownBlock({ pipeline, text, tail }: { pipeline: MarkdownPipeline; text: string; tail: readonly number[] | undefined }) {
    return tail ? renderMarkdown(pipeline, text, COMPONENTS, tail) : blockCache.render(pipeline, text, COMPONENTS);
  },
  (a, b) => a.pipeline === b.pipeline && a.text === b.text && sameTail(a.tail, b.tail),
);
