import "./Markdown.css";
import { createContext, Fragment, memo, useContext, useState, useSyncExternalStore, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { createBlockSplitter, splitBlocks } from "@/foundation/ui/markdown/streaming/markdownBlocks";
import { splitTail } from "@/foundation/ui/markdown/streaming/streamReveal";
import { createBlockCache, pipelineOf, renderMarkdown, type MarkdownPipeline } from "@/foundation/ui/markdown/markdownProcessor";
import { MarkdownFileLinksContext } from "@/foundation/ui/markdown/markdownFileLinks";
import { MarkdownImageSourcesContext, MarkdownImagesContext } from "@/foundation/ui/markdown/markdownImages";
import { MarkdownLinkOpenerContext, scrollToFragment } from "@/foundation/ui/markdown/markdownLinks";
import { linkTargetOf } from "@shared/foundation/linkTarget";
import { imageSourcesIn } from "@shared/foundation/markdown/images";
import { MermaidDiagram, MermaidPlaceholder } from "@/foundation/ui/markdown/mermaid/MermaidDiagram";
import { codeBlockOf } from "@/foundation/ui/markdown/mermaid/mermaidSource";
import { CopyButton } from "@/foundation/ui/kit/CopyButton";
import { RenderBoundary, RenderFailed } from "@/foundation/ui/kit/RenderBoundary";
import { CodeLine } from "@/foundation/ui/kit/CodeLine";
import { useHighlight } from "@/foundation/ui/code/useHighlight";
import { useNearViewport } from "@/foundation/ui/hooks/useNearViewport";
import { fenceLanguage } from "@/foundation/ui/code/languages";
import { convertTexDelimiters, mayContainMath } from "@shared/foundation/markdown/mathGuard";
import { useMathPlugins } from "@/foundation/ui/markdown/math/useMathPlugins";

/**
 * リンク。ファイルのパスらしいもの（MarkdownFileLinks の remark のプラグインが data-file-path を付けたもの）は、開けるファイルなら押して開けるチップにする。
 * ほかは行き先の判定（`@shared/foundation/linkTarget`）を通ったものだけをリンクにする: 外のページ（http・https。読み直した URL）は、
 * 開く口（MarkdownLinkOpenerContext。確認の画面・開き先の設定）で開く（中クリックも同じ）。# は窓を開かず、同じ返答の中の行き先へスクロールする。
 * ほか（相対のパス・mailto: など）はリンクにせず文字だけ（書かれた文字列を href に入れない。窓の URL に解決されてコアの URL などへ行かないように）
 */
const link: Components["a"] = function MarkdownLink({ node, href, children }) {
  const opener = useContext(MarkdownLinkOpenerContext);
  const path = node?.properties.dataFilePath;
  const target = linkTargetOf(href);
  // 押した（左・中クリック）ら、窓の既定の動き（窓の移動・新しいウィンドウ）を止めて、こちらで開く
  const activate = (e: MouseEvent<HTMLAnchorElement>) => {
    if ((e.button !== 0 && e.button !== 1) || e.defaultPrevented || !target) return;
    e.preventDefault();
    if (target.kind === "web") opener?.(e, target.url, hastText(node));
    else scrollToFragment(e.currentTarget, target.id);
  };
  const plain =
    target === null ? (
      <>{children}</>
    ) : (
      <a href={target.kind === "web" ? target.url : href} rel="noreferrer" onClick={activate} onAuxClick={activate}>
        {children}
      </a>
    );
  if (typeof path !== "string") return plain;
  const text = node?.properties.dataFileText;
  return (
    <FileLink path={path} line={Number(node?.properties.dataFileLine) || undefined} text={typeof text === "string" ? text : undefined} fallback={plain}>
      {children}
    </FileLink>
  );
};

const noSubscribe = () => () => {};

/** hast の要素の中の文字（リンクの文字。確認の画面で「文字と行き先が違う」を見分ける） */
function hastText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: unknown; children?: unknown[] };
  if (n.type === "text" && typeof n.value === "string") return n.value;
  return (n.children ?? []).map(hastText).join("");
}
const NO_SOURCES: readonly string[] = [];

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
/** 書いている途中の最後のブロックで、閉じていないコードブロックの開きの行の頭（ブロックの中の位置。なければ null） */
const OpenFence = createContext<number | null>(null);

/**
 * コードブロック。上の帯に言語名とコピーのボタンを出す（ボタンはいつも出す）。
 * ```mermaid は図にする（書いている途中は、閉じていない書きかけの図だけを枠にし、書き終えた（閉じた）図は返答の途中でも描く。
 * 一番下に付いていっているときは付いていき、上を読んでいるときは読んでいる位置をブラウザのスクロールアンカーが保つ）
 */
const codeBlock: Components["pre"] = function CodeBlock({ node, ...props }) {
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

/** 表。幅が広いときは外枠を横スクロールにして、欄からはみ出さないようにする */
const table: Components["table"] = ({ node: _node, ...props }) => (
  <div className="markdown-table">
    <table {...props} />
  </div>
);

/**
 * 画像。チャットの画面の中（MarkdownImagesContext があるとき）は、その描き方に任せる（外の画像は押すまで読み込まない・手元の画像はコアから読む）。
 * ほかの画面は、画面の手前まで来てからブラウザが読む（遠くの画像を、開いたときにまとめて読まない）
 */
const image: Components["img"] = function MarkdownImage({ node: _node, ...props }) {
  const images = useContext(MarkdownImagesContext);
  const sources = useContext(MarkdownImageSourcesContext);
  if (images && typeof props.src === "string" && props.src) return <>{images.render({ src: props.src, alt: props.alt, title: props.title, sources })}</>;
  return <img loading="lazy" decoding="async" {...props} />;
};

// 描くたびに部品が作り直されないよう（図の状態が消えないよう）、外で作っておく
const COMPONENTS: Components = { a: link, pre: codeBlock, table, img: image };

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
  // 画像の描き方を差し込まれているときだけ、文に書かれた画像の src を拾って配る（「host から画像を n 件表示」の数）
  const sources = images ? imageSourcesIn(children) : NO_SOURCES;
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
  return (
    <div className="markdown">
      <MarkdownImageSourcesContext.Provider value={sources}>
        <StreamingFlag.Provider value={streaming}>
          {/* ブロックの間には、全文を 1 度に描いたときと同じく改行の文字を置く（HTML を文字で出す所の間の空白・選んでコピーした文を変えない） */}
          {blocks.map((b, i) => (
            <Fragment key={i}>
              {i > 0 && "\n"}
              {/* 形をそろえて包む（最後のブロックが前のブロックになっても作り直さない） */}
              <OpenFence.Provider value={i === last ? openFence : null}>
                <MarkdownBlock pipeline={pipeline} text={b} tail={tails[i]} />
              </OpenFence.Provider>
            </Fragment>
          ))}
        </StreamingFlag.Provider>
      </MarkdownImageSourcesContext.Provider>
    </div>
  );
}

/** 1 つのブロック。文・処理の組・薄く出す段が同じなら描き直さない。薄く出す段がなければ、描いた要素を覚えから引く */
// 残す: tail を中身で比べる（React Compiler は比べ方を渡す memo を作れない）
const MarkdownBlock = memo(
  function MarkdownBlock({ pipeline, text, tail }: { pipeline: MarkdownPipeline; text: string; tail: readonly number[] | undefined }) {
    return tail ? renderMarkdown(pipeline, text, COMPONENTS, tail) : blockCache.render(pipeline, text, COMPONENTS);
  },
  (a, b) => a.pipeline === b.pipeline && a.text === b.text && sameTail(a.tail, b.tail),
);
