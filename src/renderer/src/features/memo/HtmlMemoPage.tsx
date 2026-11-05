import { useMemo, useRef } from "react";
import { memoAssetBase, withBaseHref } from "./htmlPage";
import { parentOf } from "./memoPaths";

/**
 * HTML のメモをページとして描く（ここでは書けない。書くのはソースの表示）。iframe の srcdoc に中身をそのまま入れ、
 * 相対パスの CSS・画像はメモのフォルダから読む（<base> をコアのファイルの口へ向ける）。
 * sandbox は allow-same-origin だけ: 中の JavaScript・フォーム・ポップアップは動かさず、外（この画面）からは中の文書に触れる。
 * リンクは中で開かない（ページ内の # は飛ぶ、外のサイトはブラウザで開く）。右クリックは選んだ文を添えてメモのメニューを開き、⌘S は保存。
 * 読み直しても（AI が書き換えたときなど）スクロールの位置は保つ。画面の CSP をそのまま受け継ぐので、インターネット上の画像・フォントは読まない
 */
export function HtmlMemoPage({
  projectId,
  path,
  html,
  onContextMenu,
  onSave,
}: {
  projectId: number;
  path: string;
  html: string;
  onContextMenu: (at: { x: number; y: number }, selected: string) => void;
  onSave: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef({ x: 0, y: 0 });
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const handlers = useRef({ onContextMenu, onSave });
  handlers.current = { onContextMenu, onSave };
  const srcDoc = useMemo(() => withBaseHref(html, memoAssetBase(location.origin, projectId, parentOf(path))), [html, projectId, path]);

  // 読み込むたびに（中身が変わると文書が作り直される）、中の文書に手を付け直す
  const attach = () => {
    const el = frame.current;
    const win = el?.contentWindow;
    const doc = el?.contentDocument;
    if (!el || !win || !doc) return;
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
      if (raw.startsWith("#")) {
        doc.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView({ block: "start" });
        return;
      }
      const url = anchor.href;
      // 外のサイト・メールはブラウザ・メールのアプリで開く（メインプロセスが外へ渡す）。メモのフォルダの中へのリンクは開かない
      if (/^(https?|mailto):/i.test(url) && !url.startsWith(`${location.origin}/`)) window.open(url, "_blank", "noopener");
    });
    doc.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      handlers.current.onContextMenu({ x: rect.left + e.clientX, y: rect.top + e.clientY }, win.getSelection()?.toString() ?? "");
    });
    doc.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handlers.current.onSave();
      }
    });
  };

  return <iframe ref={frame} className="memo-html-page" title="メモのページ" sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={attach} />;
}
