import { createContext, Fragment, useContext, type ComponentProps } from "react";
import type { Components } from "react-markdown";
import { MermaidDiagram, MermaidPlaceholder } from "@/foundation/ui/markdown/mermaid/MermaidDiagram";
import { codeBlockOf } from "@/foundation/ui/markdown/mermaid/mermaidSource";
import { CopyButton } from "@/foundation/ui/kit/CopyButton";
import { CodeLine } from "@/foundation/ui/kit/CodeLine";
import { useHighlight } from "@/foundation/ui/code/useHighlight";
import { useNearViewport } from "@/foundation/ui/hooks/useNearViewport";
import { fenceLanguage } from "@/foundation/ui/code/languages";

/** 書いている途中の返答の中か（コードブロックの部品が読む。途中と確定で同じ要素を使い回すため、部品に閉じ込めない） */
export const StreamingFlag = createContext(false);
/** 書いている途中の最後のブロックで、閉じていないコードブロックの開きの行の頭（ブロックの中の位置。なければ null） */
export const OpenFence = createContext<number | null>(null);

/**
 * コードブロック。上の帯に言語名とコピーのボタンを出す（ボタンはいつも出す）。
 * ```mermaid は図にする（書いている途中は、閉じていない書きかけの図だけを枠にし、書き終えた（閉じた）図は返答の途中でも描く。
 * 一番下に付いていっているときは付いていき、上を読んでいるときは読んでいる位置をブラウザのスクロールアンカーが保つ）
 */
export const codeBlock: Components["pre"] = function CodeBlock({ node, ...props }) {
  const streaming = useContext(StreamingFlag);
  const openFence = useContext(OpenFence);
  const block = codeBlockOf(node);
  if (block?.language === "mermaid") {
    // 閉じていないコードブロックは最後のブロックの最後にしかない（その開きより後ろから始まるコードブロックが、それ）
    const open = streaming && openFence !== null && (node?.position?.start.offset ?? -1) >= openFence;
    return open ? <MermaidPlaceholder /> : <MermaidDiagram code={block.text} />;
  }
  if (!block) return <pre {...props} />;
  return <CodeBlockBody block={block} streaming={streaming} pre={props} />;
};

/**
 * 言語名とコピーの帯の付いたコードブロック。書き終えた返答（streaming でない）は、画面の手前まで来たら文法の色を付ける
 * （色付けは Worker。色が付くまでは文字のまま出し、付いたら同じ文字を色の付いた断片に替える。<pre> の中は折り返さず、字の幅・高さは変わらない。
 * 書いている途中は付けない（書きかけのコードは文法が閉じておらず、色が行ごとに変わってちらつく））
 */
function CodeBlockBody({ block, streaming, pre }: { block: { language: string; text: string }; streaming: boolean; pre: ComponentProps<"pre"> }) {
  const [nearRef, near] = useNearViewport<HTMLDivElement>({ enabled: !streaming });
  const lang = streaming || !block.text ? undefined : fenceLanguage(block.language);
  const lines = block.text.split("\n");
  const tokens = useHighlight(lines, lang, near);
  return (
    <div className="code-block" ref={nearRef}>
      <div className="code-block-head">
        <span className="code-block-lang">{block.language}</span>
        <CopyButton text={block.text} label="コードをコピー" className="code-block-copy" />
      </div>
      {tokens ? (
        <pre {...pre}>
          {/* 文字は元の <code> と同じ（行を改行でつなぎ、最後に改行。mdast-util-to-hast がコードの終わりに足す分） */}
          <code className={`language-${block.language}`}>
            {lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && "\n"}
                <CodeLine tokens={tokens[i]} text={line} />
              </Fragment>
            ))}
            {"\n"}
          </code>
        </pre>
      ) : (
        <pre {...pre} />
      )}
    </div>
  );
}
