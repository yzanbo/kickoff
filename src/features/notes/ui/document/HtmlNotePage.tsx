import "./HtmlNotePage.css";
import { useImperativeHandle, useRef, type MutableRefObject } from "react";
import { useServerEvent } from "@/foundation/ui/api/events";
import { runPageFind } from "@/foundation/ui/kit/pageFind";
import { HtmlFrame } from "@/foundation/ui/document/HtmlFrame";
import { noteAssetBase, noteLinkPath, pageMayRead } from "./htmlPage";
import { parentOf } from "@/features/notes/ui/notePaths";

/** 外からページを読む口 */
export interface HtmlNotePageHandle {
  /** ページの中で選んでいる文と、その画面の位置（選んでいなければ null） */
  selected: () => { text: string; rect: { left: number; top: number; width: number } } | null;
}

/**
 * HTML のノートをページとして描く（土台の HtmlFrame。ここでは書けない。書くのはソースの表示）。相対パスの CSS・画像はノートのフォルダから読む（<base> をコアのファイルの口へ向ける）。
 * リンクは中で開かない（ページ内の # は飛ぶ、ノートのフォルダの中は onOpenLink（開く側がノートを開く）、外のサイトはブラウザで開く）。右クリックは選んだ文を添えてノートのメニューを開き、⌘S は保存、⌘F はこのノートを探す欄（ページの ⌘F。欄はページの中の文字も探す）。
 * 選んだ文とその位置は handleRef の selected で読む。ページが読む CSS・画像などのファイルがノートのフォルダで変わったときも描き直す（いつも最新の見た目）。画面の CSP をそのまま受け継ぐので、インターネット上の画像・フォントは読まない
 */
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

  // ノートのフォルダのほかのファイル（ページが読む CSS・画像など）が変わったら、描き直して読み直す（ファイルの口は no-cache なので、変わったものを取り直す）。
  // ほかの Markdown のノートの保存では読み直さない。このノート自体の変更は、読み直した中身が html で届いて描き直す
  useServerEvent("notes", (e) => {
    if (e.project_id === projectId && e.path !== path && pageMayRead(e.path)) frame.current?.contentWindow?.location.reload();
  });

  const openLink = (url: string) => {
    // ノートのフォルダの中（相対パスのリンク。<base> でコアのファイルの口に解決される）は、開く側に渡す
    const inNotes = noteLinkPath(url, noteAssetBase(location.origin, projectId, ""));
    if (inNotes) onOpenLink(inNotes);
    // 外のサイト・メールはブラウザ・メールのアプリで開く（メインプロセスが外へ渡す）。この画面のほかの URL は開かない
    else if (/^(https?|mailto):/i.test(url) && !url.startsWith(`${location.origin}/`)) window.open(url, "_blank", "noopener");
  };
  const onKey = (key: string) => {
    if (key === "s") onSave();
    else if (key === "f") runPageFind();
    return key === "s" || key === "f";
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

  return (
    <HtmlFrame
      frameRef={frame}
      className="note-html-page"
      title="ノートのページ"
      html={html}
      base={noteAssetBase(location.origin, projectId, parentOf(path))}
      onLink={openLink}
      interactive={{ onContextMenu, onKey }}
    />
  );
}
