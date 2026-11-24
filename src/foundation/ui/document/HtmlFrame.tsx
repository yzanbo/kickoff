import { useRef, type RefObject } from "react";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { withBaseHref } from "./htmlPage";

/** ページの中の操作を親の画面へ渡す（ページの中の押下・キー・右クリックは親に届かない） */
export interface HtmlFrameInteractive {
  /** 右クリック（画面の位置と、ページの中で選んでいる文） */
  onContextMenu(at: { x: number; y: number }, selected: string): void;
  /** ⌘ ＋ 文字のキー（key は小文字。受けたら true を返し、ページの既定の動きを止める） */
  onKey(key: string): boolean;
}

interface Props {
  /** 描く HTML（書きかけでもよい。変わると中の文書が作り直される） */
  html: string;
  /** 相対パスの CSS・画像を読む先（<base href>） */
  base: string;
  title: string;
  className?: string;
  /** ページの中の # 以外のリンクを押したとき（URL は <base> で解決したもの。中では開かない） */
  onLink?: (url: string) => void;
  /** あれば、押下・選び終え・スクロールを iframe の要素から伝え直し（開いたメニューが閉じ、選んだ文の上のボタンが出る）、右クリック・⌘ のキーを渡す */
  interactive?: HtmlFrameInteractive;
  /** iframe の要素（外から読み直す・選んだ文を読む） */
  frameRef?: RefObject<HTMLIFrameElement | null>;
}

/**
 * HTML の文書をページとして描く iframe（srcdoc。sandbox は allow-same-origin だけで、中の JavaScript・フォームは動かさない）。
 * 中身が変わって文書が作り直されてもスクロールの位置を戻す。リンクは中で開かない（ページ内の # は飛び、ほかは onLink に渡す）
 */
export function HtmlFrame({ html, base, title, className, onLink, interactive, frameRef }: Props) {
  const own = useRef<HTMLIFrameElement>(null);
  const frame = frameRef ?? own;
  const scroll = useRef({ x: 0, y: 0 });
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const handlers = useLatest({ onLink, interactive });
  const srcDoc = withBaseHref(html, base);

  // 読み込むたびに（中身が変わると文書が作り直される）、スクロールの位置を戻し、中の文書に手を付け直す
  const attach = () => {
    const el = frame.current;
    const win = el?.contentWindow;
    const doc = el?.contentDocument;
    if (!el || !win || !doc) return;
    win.scrollTo(scroll.current.x, scroll.current.y);
    win.addEventListener("scroll", () => {
      scroll.current = { x: win.scrollX, y: win.scrollY };
      // 選んだ文の上のボタンを消す（親の画面のスクロールとして見せる）
      if (handlers.current.interactive) el.dispatchEvent(new Event("scroll"));
    });
    doc.addEventListener("click", (e) => {
      // iframe の中の要素は別の世界のものなので instanceof で見分けない
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
      if (!anchor) return;
      e.preventDefault();
      const raw = anchor.getAttribute("href") ?? "";
      if (raw.startsWith("#")) doc.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView({ block: "start" });
      else handlers.current.onLink?.(anchor.href);
    });
    if (!handlers.current.interactive) return;
    // 押下（開いているメニューが外側のクリックとして閉じ、マウスを乗せたときの説明も消える）と、選び終えた mouseup を iframe の要素から伝え直す
    const forward = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, button: e.button, buttons: e.buttons, clientX: rect.left + e.clientX, clientY: rect.top + e.clientY };
      el.dispatchEvent(e.type === "pointerdown" ? new PointerEvent("pointerdown", init) : new MouseEvent(e.type, init));
    };
    for (const type of ["pointerdown", "mousedown", "mouseup"] as const) doc.addEventListener(type, forward);
    doc.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      handlers.current.interactive?.onContextMenu({ x: rect.left + e.clientX, y: rect.top + e.clientY }, win.getSelection()?.toString() ?? "");
    });
    doc.addEventListener("keydown", (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (handlers.current.interactive?.onKey(e.key.toLowerCase())) e.preventDefault();
    });
  };

  return <iframe ref={frame} className={className} title={title} sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={attach} />;
}
