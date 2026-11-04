import { useState, type MouseEvent, type ReactNode } from "react";
import { reportFailure } from "@/features/chat/chatActions";
import { clampToViewport, MenuItem, PopupMenu } from "@/ui/PopupMenu";
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
  const [at, setAt] = useState<{ x: number; y: number; src: string; name: string; onView?: () => void }>();
  return {
    active: Boolean(at),
    open: (e, image, onView) => {
      e.preventDefault();
      e.stopPropagation();
      setAt({ ...clampToViewport(e.clientX, e.clientY, 180, 110), ...image, onView });
    },
    element: at && (
      <PopupMenu x={at.x} y={at.y} label="画像の操作" onClose={() => setAt(undefined)}>
        {/* 押した直後に書き込む（待つと、押した操作によるコピーと見なされないことがある） */}
        <MenuItem onSelect={() => void copyImage(at.src).catch(reportFailure("画像をコピーできませんでした"))}>画像をコピー</MenuItem>
        {at.onView && <MenuItem onSelect={at.onView}>大きく表示</MenuItem>}
        <MenuItem onSelect={() => downloadImage(at.src, at.name)}>画像を保存</MenuItem>
      </PopupMenu>
    ),
  };
}
