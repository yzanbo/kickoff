import { memo, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeStreamTail } from "@/lib/streamReveal";
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

/**
 * コードブロック。上の帯に言語名とコピーのボタンを出す（ボタンはいつも出す）。
 * ```mermaid は図にする（生成中は、書きかけの図を描かずに枠だけ出す）
 */
function codeBlock(streaming: boolean): Components["pre"] {
  return function CodeBlock({ node, ...props }) {
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
}

/** 表。幅が広いときは外枠を横スクロールにして、欄からはみ出さないようにする */
const table: Components["table"] = ({ node: _node, ...props }) => (
  <div className="markdown-table">
    <table {...props} />
  </div>
);

// 描くたびに部品が作り直されないよう（図の状態が消えないよう）、外で作っておく
const COMPONENTS: Components = { a: link, pre: codeBlock(false), table };
const STREAMING_COMPONENTS: Components = { a: link, pre: codeBlock(true), table };

type MarkdownProps = { children: string; streaming?: boolean; tail?: readonly number[] };

/** 出たばかりの文字の段が同じか（段の配列は描くたびに作られるので中身で比べる） */
const sameTail = (a: readonly number[] | undefined, b: readonly number[] | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.length === b.length && a.every((n, i) => n === b[i]));

/**
 * AI の発言などの Markdown 表示（HTML は描画しない）。本文と設定（streaming・tail）が同じなら描き直さない
 * （親が描き直るたびに全文を解析し直さないため。ファイルのリンクなど context の値が変わったときは描き直る）。```mermaid は図にする。
 * 数式（$$…$$・\(…\)・\[…\]・数式らしい $…$。`@shared/markdown/mathGuard`）は KaTeX で描く（数式の書き方を含むときだけ部品を読み込む）。
 * チャットのパネルの中（MarkdownFileLinksContext があるとき）は、作業場所のファイルのパスを押して開けるチップにする。
 * streaming: 生成中の返答。tail: 生成中に出たばかりの文字の数（出てからの時間で分けた段。新しい順。終わりの文字を段ごとに薄く出す。`useStreamReveal`）
 */
export const Markdown = memo(MarkdownBody, (a, b) => a.children === b.children && a.streaming === b.streaming && sameTail(a.tail, b.tail));

function MarkdownBody({ children, streaming = false, tail }: MarkdownProps) {
  const links = useContext(MarkdownFileLinksContext);
  const hasMath = mayContainMath(children);
  const math = useMathPlugins(hasMath);
  const withMath = hasMath && math !== null;
  const remarkPlugins = useMemo<Options["remarkPlugins"]>(
    () => [remarkGfm, ...(withMath ? math.remark : []), ...(links ? [links.remarkPlugin] : [])],
    [links, withMath, math],
  );
  // 生成中の薄く出す文字を包んでから数式を描く（数式の要素は KaTeX が丸ごと置き換える）
  const rehypePlugins = useMemo<Options["rehypePlugins"]>(
    () => [...(tail?.some((n) => n > 0) ? [rehypeStreamTail(tail)] : []), ...(withMath ? math.rehype : [])],
    [tail, withMath, math],
  );
  const text = useMemo(() => (withMath ? convertTexDelimiters(children) : children), [children, withMath]);
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={streaming ? STREAMING_COMPONENTS : COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
