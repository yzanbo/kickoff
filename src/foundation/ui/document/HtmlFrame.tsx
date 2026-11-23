import { useRef } from "react";
import { withBaseHref } from "./htmlPage";

interface Props {
  /** 描く HTML（書きかけでもよい。変わると中の文書が作り直される） */
  html: string;
  /** 相対パスの CSS・画像を読む先（<base href>） */
  base: string;
  title: string;
  className?: string;
  /** ページの中の # 以外のリンクを押したとき（URL は <base> で解決したもの。中では開かない） */
  onLink?: (url: string) => void;
}

/**
 * HTML の文書をページとして描く iframe（srcdoc。sandbox は allow-same-origin だけで、中の JavaScript・フォームは動かさない）。
 * 中身が変わって文書が作り直されてもスクロールの位置を戻す。リンクは中で開かない（ページ内の # は飛び、ほかは onLink に渡す）
 */
export function HtmlFrame({ html, base, title, className, onLink }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef({ x: 0, y: 0 });
  const srcDoc = withBaseHref(html, base);

  // 読み込むたびに（中身が変わると文書が作り直される）、スクロールの位置を戻し、リンクを中で開かないようにする
  const attach = () => {
    const win = frame.current?.contentWindow;
    const doc = frame.current?.contentDocument;
    if (!win || !doc) return;
    win.scrollTo(scroll.current.x, scroll.current.y);
    win.addEventListener("scroll", () => {
      scroll.current = { x: win.scrollX, y: win.scrollY };
    });
    doc.addEventListener("click", (e) => {
      // iframe の中の要素は別の世界のものなので instanceof で見分けない
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
      if (!anchor) return;
      e.preventDefault();
      const raw = anchor.getAttribute("href") ?? "";
      if (raw.startsWith("#")) doc.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView({ block: "start" });
      else onLink?.(anchor.href);
    });
  };

  return <iframe ref={frame} className={className} title={title} sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={attach} />;
}
