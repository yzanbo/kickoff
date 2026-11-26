import type { MouseEvent, ReactNode } from "react";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { MenuSeparator } from "@/foundation/ui/kit/menuParts";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { downloadUrl } from "@/foundation/ui/lib/download";
import { CopyFileItem, RevealAndPathItems, useUploadPath } from "./AttachmentPathItems";

/** 保存した添付のファイル（id = 添付の ID・href = ダウンロードの URL・name = 保存するときの名前） */
export interface SavedFile {
  id: string;
  href: string;
  name: string;
}

/**
 * 画像以外の添付（動画・PDF・zip など）の札の右クリックのメニュー（ファイルをコピー・保存・Finder で表示・パスをコピー）。
 * 発言の右クリックのメニュー（選んだ文のコピー）には伝えず、札の上ではこちらだけを出す（画像の useImageMenu と同じ）
 */
export function useFileMenu(): { open: (e: MouseEvent, target: SavedFile) => void; element: ReactNode } {
  const menu = useContextMenu<SavedFile>();
  const shown = menu.menu;
  return {
    open: (e, target) => {
      e.stopPropagation();
      menu.open(e, target);
    },
    element: shown && (
      <PopupMenu at={shown.at} label="ファイルの操作" onClose={menu.close}>
        <FileMenuItems target={shown.value} />
      </PopupMenu>
    ),
  };
}

/** メニューの中身（開いている間だけパスを読む） */
function FileMenuItems({ target }: { target: SavedFile }) {
  const path = useUploadPath(target.id);
  return (
    <>
      <CopyFileItem {...path} />
      <MenuItem onSelect={() => downloadUrl(target.href, target.name)}>保存</MenuItem>
      <MenuSeparator />
      <RevealAndPathItems {...path} />
    </>
  );
}
