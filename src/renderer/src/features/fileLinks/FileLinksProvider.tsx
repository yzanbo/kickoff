import { useCallback, useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import { MarkdownFileLinksContext, type MarkdownFileLinks } from "@/ui/markdown/markdownFileLinks";
import { useContextMenu } from "@/ui/useContextMenu";
import { FileLinkContext, openByClick, type FileLinks } from "./fileLinkContext";
import { FileMenu } from "./FileMenu";
import { remarkFileLinks, type FileRef } from "./fileRefs";
import type { ChatFileLinks } from "./useFileLinks";

/**
 * チャットのパネルの中で、返答のファイルのパス（Markdown）・ターンの変更カード・ツールの行・右の欄の変更を、押して開けるようにする。
 * 右クリックのメニュー（FileMenu）はここで 1 つだけ描く
 */
export function FileLinksProvider({ value, children }: { value: ChatFileLinks | undefined; children: ReactNode }) {
  const menu = useContextMenu<FileRef>();
  // 返答の Markdown を描き直させないよう、メニューを開く関数は同じものにする（中身はいつも最新）
  const openMenu = useRef(menu.open);
  openMenu.current = menu.open;
  const showMenu = useCallback((e: MouseEvent, ref: FileRef) => openMenu.current(e, ref), []);
  const links = useMemo<FileLinks | undefined>(() => (value ? { ...value, showMenu } : undefined), [value, showMenu]);
  const markdown = useMemo<MarkdownFileLinks | undefined>(
    () =>
      links
        ? {
            remarkPlugin: [remarkFileLinks, links.index],
            open: (e, path, line) => openByClick(links, e, { path, ...(line ? { line } : {}) }),
            menu: (e, path, line) => links.showMenu(e, { path, ...(line ? { line } : {}) }),
            title: (path, line) => `${path}${line ? `（${line} 行目）` : ""} を${links.side ? "右の欄" : "ファイルタブ"}で開く（⌘クリックでファイルタブ・右クリックでほかの開き方）`,
          }
        : undefined,
    [links],
  );
  return (
    <FileLinkContext.Provider value={links}>
      <MarkdownFileLinksContext.Provider value={markdown}>{children}</MarkdownFileLinksContext.Provider>
      {links && menu.menu && <FileMenu at={menu.menu.at} file={menu.menu.value} links={links} onClose={menu.close} />}
    </FileLinkContext.Provider>
  );
}
