import type { MouseEvent, ReactNode } from "react";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { copyImage, downloadImage } from "./imageFile";

/**
 * 画像の右クリックのメニュー（画像をコピー・大きく表示・保存）。チャットの添付のサムネイル・添付の一覧で共通。
 * 発言の右クリックのメニュー（メッセージをコピー）には伝えず、画像の上ではこちらだけを出す
 */
export function useImageMenu(): {
  /** onView: 「大きく表示」で開く（なければ項目を出さない） */
  open: (e: MouseEvent, image: { src: string; name: string }, onView?: () => void) => void;
  element: ReactNode;
  /** メニューを開いているか（開いている間は、外側クリックで閉じる入れ物を閉じない） */
  active: boolean;
} {
  const menu = useContextMenu<{ src: string; name: string; onView?: () => void }>();
  const shown = menu.menu;
  return {
    active: menu.isOpen,
    open: (e, image, onView) => {
      e.stopPropagation();
      menu.open(e, { ...image, onView });
    },
    element: shown && (
      <PopupMenu at={shown.at} label="画像の操作" onClose={menu.close}>
        {/* 押した直後に書き込む（待つと、押した操作によるコピーと見なされないことがある） */}
        <MenuItem onSelect={() => void copyImage(shown.value.src).catch(reportFailure("画像をコピーできませんでした"))}>画像をコピー</MenuItem>
        {shown.value.onView && <MenuItem onSelect={shown.value.onView}>大きく表示</MenuItem>}
        <MenuItem onSelect={() => downloadImage(shown.value.src, shown.value.name)}>画像を保存</MenuItem>
      </PopupMenu>
    ),
  };
}
