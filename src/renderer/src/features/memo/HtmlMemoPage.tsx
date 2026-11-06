import { useMemo, useRef } from "react";
import { memoAssetBase, memoLinkPath, withBaseHref } from "./htmlPage";
import { parentOf } from "./memoPaths";

/**
 * HTML のメモをページとして描く（ここでは書けない。書くのはソースの表示）。iframe の srcdoc に中身をそのまま入れ、
 * 相対パスの CSS・画像はメモのフォルダから読む（<base> をコアのファイルの口へ向ける）。
 * sandbox は allow-same-origin だけ: 中の JavaScript・フォーム・ポップアップは動かさず、外（この画面）からは中の文書に触れる。
 * リンクは中で開かない（ページ内の # は飛ぶ、メモのフォルダの中は onOpenLink（開く側がメモを開く）、外のサイトはブラウザで開く）。右クリックは選んだ文を添えてメモのメニューを開き、⌘S は保存。
 * 読み直しても（AI が書き換えたときなど）スクロールの位置は保つ。画面の CSP をそのまま受け継ぐので、インターネット上の画像・フォントは読まない
 */
export function HtmlMemoPage({
  projectId,
  path,
  html,
  onContextMenu,
  onSave,
  onOpenLink,
}: {
  projectId: number;
  path: string;
  html: string;
  onContextMenu: (at: { x: number; y: number }, selected: string) => void;
  onSave: () => void;
  /** メモのフォルダの中へのリンクを押した（メモのフォルダからの相対パス） */
  onOpenLink: (path: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef({ x: 0, y: 0 });
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const handlers = useRef({ onContextMenu, onSave, onOpenLink });
  handlers.current = { onContextMenu, onSave, onOpenLink };
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
      // メモのフォルダの中（相対パスのリンク。<base> でコアのファイルの口に解決される）は、開く側に渡す
      const inMemos = memoLinkPath(url, memoAssetBase(location.origin, projectId, ""));
      if (inMemos) handlers.current.onOpenLink(inMemos);
      // 外のサイト・メールはブラウザ・メールのアプリで開く（メインプロセスが外へ渡す）。この画面のほかの URL は開かない
      else if (/^(https?|mailto):/i.test(url) && !url.startsWith(`${location.origin}/`)) window.open(url, "_blank", "noopener");
    });
    // ページの中の押下は親の画面に届かないので、iframe の要素から伝え直す
    // （開いているメニュー・ポップオーバーが外側のクリックとして閉じ（useDismiss）、マウスを乗せたときの説明も消える）
    const forward = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, button: e.button, buttons: e.buttons, clientX: rect.left + e.clientX, clientY: rect.top + e.clientY };
      el.dispatchEvent(e.type === "pointerdown" ? new PointerEvent("pointerdown", init) : new MouseEvent("mousedown", init));
    };
    doc.addEventListener("pointerdown", forward);
    doc.addEventListener("mousedown", forward);
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
