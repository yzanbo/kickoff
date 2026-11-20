import { useImperativeHandle, useMemo, useRef, type MutableRefObject } from "react";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useServerEvent } from "@/foundation/ui/api/events";
import { runPageFind } from "@/foundation/ui/kit/pageFind";
import { noteAssetBase, noteLinkPath, withBaseHref } from "./htmlPage";
import { parentOf } from "./notePaths";

/**
 * HTML のノートをページとして描く（ここでは書けない。書くのはソースの表示）。iframe の srcdoc に中身をそのまま入れ、
 * 相対パスの CSS・画像はノートのフォルダから読む（<base> をコアのファイルの口へ向ける）。
 * sandbox は allow-same-origin だけ: 中の JavaScript・フォーム・ポップアップは動かさず、外（この画面）からは中の文書に触れる。
 * リンクは中で開かない（ページ内の # は飛ぶ、ノートのフォルダの中は onOpenLink（開く側がノートを開く）、外のサイトはブラウザで開く）。右クリックは選んだ文を添えてノートのメニューを開き、⌘S は保存、⌘F はこのノートを探す欄（ページの ⌘F。欄はページの中の文字も探す）。
 * 選んだ文とその位置は handleRef の selected で読む（選び終えた mouseup とスクロールは、親の画面へ伝え直す。「チャットに追加」のボタン）。
 * 読み直しても（AI が書き換えたときなど）スクロールの位置は保つ。ページが読む CSS・画像などのファイルがノートのフォルダで変わったときも描き直す（いつも最新の見た目）。画面の CSP をそのまま受け継ぐので、インターネット上の画像・フォントは読まない
 */
/** 外からページを読む口 */
export interface HtmlNotePageHandle {
  /** ページの中で選んでいる文と、その画面の位置（選んでいなければ null） */
  selected: () => { text: string; rect: { left: number; top: number; width: number } } | null;
}

export function HtmlNotePage({
  projectId,
  path,
  html,
  onContextMenu,
  onSave,
  onOpenLink,
  handleRef,
}: {
  projectId: number;
  path: string;
  html: string;
  onContextMenu: (at: { x: number; y: number }, selected: string) => void;
  onSave: () => void;
  /** ノートのフォルダの中へのリンクを押した（ノートのフォルダからの相対パス） */
  onOpenLink: (path: string) => void;
  handleRef?: MutableRefObject<HtmlNotePageHandle | null>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef({ x: 0, y: 0 });
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const handlers = useLatest({ onContextMenu, onSave, onOpenLink });
  const srcDoc = useMemo(() => withBaseHref(html, noteAssetBase(location.origin, projectId, parentOf(path))), [html, projectId, path]);

  // ノートのフォルダのほかのファイル（ページが読む CSS・画像など）が変わったら、描き直して読み直す（ファイルの口は no-cache なので、変わったものを取り直す）。
  // このノート自体の変更は、読み直した中身が html で届いて描き直す
  useServerEvent("notes", (e) => {
    if (e.project_id === projectId && e.path !== path) frame.current?.contentWindow?.location.reload();
  });

  // 読み込むたびに（中身が変わると文書が作り直される）、中の文書に手を付け直す
  const attach = () => {
    const el = frame.current;
    const win = el?.contentWindow;
    const doc = el?.contentDocument;
    if (!el || !win || !doc) return;
    win.scrollTo(scroll.current.x, scroll.current.y);
    win.addEventListener("scroll", () => {
      scroll.current = { x: win.scrollX, y: win.scrollY };
      // 選んだ文の上のボタンを消す（親の画面のスクロールとして見せる）
      el.dispatchEvent(new Event("scroll"));
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
      // ノートのフォルダの中（相対パスのリンク。<base> でコアのファイルの口に解決される）は、開く側に渡す
      const inNotes = noteLinkPath(url, noteAssetBase(location.origin, projectId, ""));
      if (inNotes) handlers.current.onOpenLink(inNotes);
      // 外のサイト・メールはブラウザ・メールのアプリで開く（メインプロセスが外へ渡す）。この画面のほかの URL は開かない
      else if (/^(https?|mailto):/i.test(url) && !url.startsWith(`${location.origin}/`)) window.open(url, "_blank", "noopener");
    });
    // ページの中の押下は親の画面に届かないので、iframe の要素から伝え直す
    // （開いているメニュー・ポップオーバーが外側のクリックとして閉じ（useDismiss）、マウスを乗せたときの説明も消える）
    // 選び終えた mouseup も伝え直す（選んだ文の上に「チャットに追加」を出す）
    const forward = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, button: e.button, buttons: e.buttons, clientX: rect.left + e.clientX, clientY: rect.top + e.clientY };
      el.dispatchEvent(e.type === "pointerdown" ? new PointerEvent("pointerdown", init) : new MouseEvent(e.type, init));
    };
    doc.addEventListener("pointerdown", forward);
    doc.addEventListener("mousedown", forward);
    doc.addEventListener("mouseup", forward);
    doc.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      handlers.current.onContextMenu({ x: rect.left + e.clientX, y: rect.top + e.clientY }, win.getSelection()?.toString() ?? "");
    });
    // ページの中のキーは親の画面に届かないので、⌘S（保存）・⌘F（このノートを探す。ページの文字も探す欄）はここで受ける
    doc.addEventListener("keydown", (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        handlers.current.onSave();
      } else if (key === "f") {
        e.preventDefault();
        runPageFind();
      }
    });
  };

  // 外から読む口（描く中で ref に書かない）
  useImperativeHandle(handleRef, () => ({
    selected: () => {
      const el = frame.current;
      const selection = el?.contentWindow?.getSelection();
      const text = selection?.toString().trim();
      // ページにピントがあるときだけ（ほかの所で選び直したあとに、ページに残った選択で出さない）
      if (!el || document.activeElement !== el || !selection || !text || selection.rangeCount === 0) return null;
      const box = selection.getRangeAt(0).getBoundingClientRect();
      const offset = el.getBoundingClientRect();
      return { text, rect: { left: offset.left + box.left, top: offset.top + box.top, width: box.width } };
    },
  }));

  return <iframe ref={frame} className="note-html-page" title="ノートのページ" sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={attach} />;
}
