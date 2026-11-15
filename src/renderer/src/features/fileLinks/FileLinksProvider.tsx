import { useCallback, useLayoutEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useLatest } from "@/hooks/useLatest";
import { MarkdownFileLinksContext, type MarkdownFileLinks } from "@/ui/markdown/markdownFileLinks";
import { useContextMenu } from "@/ui/useContextMenu";
import { FileLinkContext, openByClick, type FileLinks } from "./fileLinkContext";
import { FileMenu } from "./FileMenu";
import { createFileIndexStore } from "./fileIndexStore";
import { remarkFileLinks, type FileRef } from "./fileRefs";
import type { ChatFileLinks } from "./useFileLinks";

/**
 * チャットのパネルの中で、返答のファイルのパス（Markdown）・ターンの変更カード・ツールの行・右の欄の変更を、押して開けるようにする。
 * 右クリックのメニュー（FileMenu）はここで 1 つだけ描く。
 * 返答の Markdown に渡すもの（MarkdownFileLinksContext）は、作業場所が同じ間は同じ物にする: remark の差し込みは作業場所のフォルダだけで
 * パスらしい文字に印を付け、開けるかはリンクがファイルの一覧の小さな店（fileIndexStore）からパスごとに選んで読む
 * （作業が終わるたびに一覧を取り直しても、すべての返答を解析し直さない。メモの仕様書「0023_表示を軽くする」の案 28）
 */
export function FileLinksProvider({ value, children }: { value: ChatFileLinks | undefined; children: ReactNode }) {
  const menu = useContextMenu<FileRef>();
  // 返答の Markdown を描き直させないよう、メニューを開く関数は同じものにする（中身はいつも最新）
  const openMenu = useLatest(menu.open);
  const showMenu = useCallback((e: MouseEvent, ref: FileRef) => openMenu.current(e, ref), [openMenu]);
  const links = useMemo<FileLinks | undefined>(() => (value ? { ...value, showMenu } : undefined), [value, showMenu]);
  // ファイルの一覧の店。一覧はこの描き直しのうちに入れ（同じ描き直しで描くリンクが読む）、知らせは描いたあとに出す（memo して描き直らないリンクのため）
  const [store] = useState(createFileIndexStore);
  const index = links?.index;
  store.replace(index);
  useLayoutEffect(() => store.notify(), [store, index]);
  // 押したときは、いまの開き方を使う（下の値を一覧の取り直しで作り直さないため）
  const latest = useLatest(links);
  const root = index?.root;
  const side = links?.side ?? false;
  const markdown = useMemo<MarkdownFileLinks | undefined>(
    () =>
      root === undefined
        ? undefined
        : {
            remarkPlugin: [remarkFileLinks, root],
            resolve: store.resolve,
            subscribe: store.subscribe,
            open: (e, path, line) => {
              if (latest.current) openByClick(latest.current, e, { path, ...(line ? { line } : {}) });
            },
            menu: (e, path, line) => latest.current?.showMenu(e, { path, ...(line ? { line } : {}) }),
            title: (path, line) => `${path}${line ? `（${line} 行目）` : ""} を${side ? "右の欄" : "ファイルタブ"}で開く（⌘クリックでファイルタブ・右クリックでほかの開き方）`,
          },
    [root, side, store, latest],
  );
  return (
    <FileLinkContext.Provider value={links}>
      <MarkdownFileLinksContext.Provider value={markdown}>{children}</MarkdownFileLinksContext.Provider>
      {links && menu.menu && <FileMenu at={menu.menu.at} file={menu.menu.value} links={links} onClose={menu.close} />}
    </FileLinkContext.Provider>
  );
}
