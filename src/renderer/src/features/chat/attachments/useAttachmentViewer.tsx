import { useState, type MouseEvent, type ReactNode } from "react";
import { ImageViewer, type ViewerImage } from "@/ui/imageViewer/ImageViewer";
import { useImageMenu } from "@/ui/imageViewer/useImageMenu";

/**
 * 添付の画像を大きく見る（添付のチップ・送信待ちの行と指示の帯の 1 行の添付・添付の一覧で共通）。
 * images は同じ発言・同じ行の画像（大きく見ている間は ← / → で前後へ）。画像の右クリック（コピー・大きく表示・保存）も持ち、
 * element を描く（右クリックのメニューと、開いている画像）
 */
export function useAttachmentViewer(images: ViewerImage[]): {
  /** images の中の位置の画像を大きく見る（見つからない位置なら何もしない） */
  open: (index: number) => void;
  /** 画像の右クリック（外側の行・発言の右クリックのメニューには伝えない） */
  menu: (e: MouseEvent, index: number) => void;
  /** 大きく見ている・右クリックのメニューを開いている（その間は、外側クリックで閉じる入れ物を閉じない） */
  active: boolean;
  element: ReactNode;
} {
  const [viewing, setViewing] = useState<number>();
  const imageMenu = useImageMenu();
  const open = (index: number) => {
    if (index >= 0 && index < images.length) setViewing(index);
  };
  return {
    open,
    menu: (e, index) => {
      const image = images[index];
      if (image) imageMenu.open(e, image, () => open(index));
    },
    active: viewing !== undefined || imageMenu.active,
    element: (
      <>
        {imageMenu.element}
        {viewing !== undefined && <ImageViewer images={images} index={viewing} onClose={() => setViewing(undefined)} />}
      </>
    ),
  };
}
