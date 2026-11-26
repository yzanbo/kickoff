import { useState, type MouseEvent, type ReactNode } from "react";
import { ImageViewer, type ViewerImage } from "@/foundation/ui/kit/imageViewer/ImageViewer";
import { useImageMenu } from "@/foundation/ui/kit/imageViewer/useImageMenu";
import { ImagePathItems } from "./AttachmentPathItems";

/** 大きく見る画像（uploadId: 添付の画像なら、その ID。右クリックに Finder で表示・パスをコピーを足す。ツールの画像・外の画像にはない） */
export type AttachmentViewerImage = ViewerImage & { uploadId?: string };

/**
 * 添付の画像を大きく見る（添付のチップ・送信待ちの行と指示の帯の 1 行の添付・添付の一覧で共通）。
 * images は同じ発言・同じ行の画像（大きく見ている間は ← / → で前後へ）。画像の右クリック（コピー・大きく表示・保存。添付の画像なら Finder で表示・パスをコピーも）も持ち、
 * element を描く（右クリックのメニューと、開いている画像）
 */
export function useAttachmentViewer(images: AttachmentViewerImage[]): {
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
      if (image) imageMenu.open(e, image, { onView: () => open(index), extra: image.uploadId ? <ImagePathItems id={image.uploadId} /> : undefined });
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
