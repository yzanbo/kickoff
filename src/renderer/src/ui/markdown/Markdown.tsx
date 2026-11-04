import { useContext, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownFileLinksContext } from "./markdownFileLinks";
import { MermaidDiagram, MermaidPlaceholder } from "@/ui/markdown/mermaid/MermaidDiagram";
import { codeBlockOf } from "@/ui/markdown/mermaid/mermaidSource";
import { CopyButton } from "@/ui/CopyButton";

/** リンク。ファイルのパス（MarkdownFileLinks の remark のプラグインが data-file-path を付けたもの）は、押して開けるチップにする */
const link: Components["a"] = ({ node, href, children }) => {
  const path = node?.properties.dataFilePath;
  if (typeof path === "string") return <FileLink path={path} line={Number(node?.properties.dataFileLine) || undefined}>{children}</FileLink>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
};

/** 押すとエディタタブでファイルを開くチップ（中はインラインコードかリンクの文字） */
function FileLink({ path, line, children }: { path: string; line?: number; children: ReactNode }) {
  const links = useContext(MarkdownFileLinksContext);
  if (!links) return <>{children}</>;
  return (
    <button type="button" className="file-link" title={`エディタで開く: ${path}${line ? `（${line} 行目）` : ""}`} onClick={() => links.open(path, line)}>
      {children}
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

/**
 * AI の発言などの Markdown 表示（HTML は描画しない）。```mermaid は図にする。
 * チャットのパネルの中（MarkdownFileLinksContext があるとき）は、作業場所のファイルのパスを押して開けるチップにする。
 * streaming: 生成中の返答
 */
export function Markdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  const links = useContext(MarkdownFileLinksContext);
  const remarkPlugins = useMemo<Options["remarkPlugins"]>(() => (links ? [remarkGfm, links.remarkPlugin] : [remarkGfm]), [links]);
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={streaming ? STREAMING_COMPONENTS : COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
