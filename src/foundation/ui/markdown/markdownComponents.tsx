import { useContext, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { linkTargetOf } from "@shared/foundation/linkTarget";
import { MarkdownFileLinksContext } from "@/foundation/ui/markdown/markdownFileLinks";
import { MarkdownImageSourcesContext, MarkdownImagesContext } from "@/foundation/ui/markdown/markdownImages";
import { linkTextOf, MarkdownLinkOpenerContext, pressLink } from "@/foundation/ui/markdown/markdownLinks";
import { details, summary } from "@/foundation/ui/markdown/MarkdownDetails";
import { codeBlock } from "./MarkdownCodeBlock";

// Markdown の部品が差し替える要素（リンク・ファイルのチップ・表・画像。コードブロックは MarkdownCodeBlock.tsx、たたむ部分は MarkdownDetails.tsx）

/**
 * リンク。ファイルのパスらしいもの（MarkdownFileLinks の remark のプラグインが data-file-path を付けたもの）は、開けるファイルなら押して開けるチップにする。
 * ほかは行き先の判定（`@shared/foundation/linkTarget`）を通ったものだけをリンクにする: 外のページ（http・https。読み直した URL）は、
 * 開く口（MarkdownLinkOpenerContext。確認の画面・開き先の設定）で開く（中クリックも同じ）。# は窓を開かず、同じ返答の中の行き先へスクロールする。
 * ほか（相対のパス・mailto: など）はリンクにせず文字だけ（書かれた文字列を href に入れない。窓の URL に解決されてコアの URL などへ行かないように）
 */
const link: Components["a"] = function MarkdownLink({ node, href, children, id, "aria-label": label, "aria-describedby": describedBy }) {
  const opener = useContext(MarkdownLinkOpenerContext);
  const path = node?.properties.dataFilePath;
  const target = linkTargetOf(href);
  // 押した（左・中クリック）ら、窓の既定の動き（窓の移動・新しいウィンドウ）を止めて、こちらで開く
  const activate = (e: MouseEvent<HTMLAnchorElement>) => pressLink(e, e.currentTarget, opener, () => linkTextOf(node));
  const plain =
    target === null ? (
      <>{children}</>
    ) : (
      // id・説明は脚注の番号と戻る印のもの（remark-rehype が付ける。戻る印の行き先は番号の id）
      <a href={target.kind === "web" ? target.url : href} id={id} aria-label={label} aria-describedby={describedBy} rel="noreferrer" onClick={activate} onAuxClick={activate}>
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
export const COMPONENTS: Components = { a: link, pre: codeBlock, table, img: image, details, summary };
