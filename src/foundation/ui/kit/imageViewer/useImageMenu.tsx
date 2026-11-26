import type { MouseEvent, ReactNode } from "react";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { MenuSeparator } from "@/foundation/ui/kit/menuParts";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { copyImage, downloadFile } from "./imageFile";

/** 画像のメニューを開くときの任意の項目（onView: 「大きく表示」で開く。extra: 下の組に足す項目 = 添付の画像なら Finder で表示・パスをコピー） */
interface ImageMenuOptions {
  onView?: () => void;
  extra?: ReactNode;
}

/**
 * 画像の右クリックのメニュー（画像をコピー・大きく表示・保存と、開いた所が足す項目）。
 * 発言の右クリックのメニュー（メッセージをコピー）には伝えず、画像の上ではこちらだけを出す
 */
export function useImageMenu(): {
  open: (e: MouseEvent, image: { src: string; name: string }, options?: ImageMenuOptions) => void;
  element: ReactNode;
  /** メニューを開いているか（開いている間は、外側クリックで閉じる入れ物を閉じない） */
  active: boolean;
} {
  const menu = useContextMenu<{ src: string; name: string } & ImageMenuOptions>();
  const shown = menu.menu;
  return {
    active: menu.isOpen,
    open: (e, image, options) => {
      e.stopPropagation();
      menu.open(e, { ...image, ...options });
    },
    element: shown && (
      <PopupMenu at={shown.at} label="画像の操作" onClose={menu.close}>
        {/* 押した直後に書き込む（待つと、押した操作によるコピーと見なされないことがある） */}
        <MenuItem onSelect={() => void copyImage(shown.value.src).catch(reportFailure("画像をコピーできませんでした"))}>画像をコピー</MenuItem>
        {shown.value.onView && <MenuItem onSelect={shown.value.onView}>大きく表示</MenuItem>}
        <MenuItem onSelect={() => downloadFile(shown.value.src, shown.value.name)}>画像を保存</MenuItem>
        {shown.value.extra && (
          <>
            <MenuSeparator />
            {shown.value.extra}
          </>
        )}
      </PopupMenu>
    ),
  };
}
