import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram, MermaidPlaceholder } from "./mermaid/MermaidDiagram";
import { codeBlockOf } from "./mermaid/mermaidSource";
import { CopyButton } from "./CopyButton";

const link: Components["a"] = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

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

// 描くたびに部品が作り直されないよう（図の状態が消えないよう）、外で作っておく
const COMPONENTS: Components = { a: link, pre: codeBlock(false) };
const STREAMING_COMPONENTS: Components = { a: link, pre: codeBlock(true) };

/**
 * AI の発言などの Markdown 表示（HTML は描画しない）。```mermaid は図にする。
 * streaming: 生成中の返答
 */
export function Markdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={streaming ? STREAMING_COMPONENTS : COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
