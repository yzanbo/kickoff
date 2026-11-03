import { Expand, Shrink, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../cx";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { IconButton } from "../IconButton";
import { useImageZoom } from "./useImageZoom";
import { ViewerHead } from "./ViewerHead";

/** 大きく見る画像 1 枚 */
export interface ViewerImage {
  src: string;
  name: string;
}

/** ⌘ ＋ この文字で拡大（US 配列の = / +、JIS 配列の ; / +） */
const ZOOM_IN_KEYS = new Set(["=", "+", ";"]);

/**
 * 画像 1 枚を、拡大・縮小・ドラッグで動かしながら見る（見出しと画像の枠）。
 * 開き直す・前後の画像へ移るたびに作り直すので、そのたびに「画面に合わせる」に戻る。
 * ⌘+ / ⌘- / ⌘0（画面に合わせる）。Esc は <dialog> に任せる
 */
export function ImageView({ image, onClose, actions }: { image: ViewerImage; onClose: () => void; actions?: ReactNode }) {
  const zoom = useImageZoom();

  useWindowEvent(
    "keydown",
    (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (ZOOM_IN_KEYS.has(e.key)) zoom.zoomIn();
      else if (e.key === "-") zoom.zoomOut();
      else if (e.key === "0") zoom.fit();
      else return;
      // アプリ全体の拡大・縮小やほかのショートカットに渡さない
      e.preventDefault();
      e.stopPropagation();
    },
    true,
    true,
  );

  return (
    <>
      <ViewerHead name={image.name} onClose={onClose}>
        <span className="image-viewer-tools">
          <IconButton icon={ZoomOut} label="縮小" title="縮小（⌘-）" size={15} onClick={zoom.zoomOut} />
          <span className="image-viewer-zoom" aria-live="polite" aria-label={`倍率 ${zoom.percent}%`}>
            {zoom.percent}%
          </span>
          <IconButton icon={ZoomIn} label="拡大" title="拡大（⌘+）" size={15} onClick={zoom.zoomIn} />
          <IconButton
            icon={zoom.fitted ? Expand : Shrink}
            label={zoom.fitted ? "100%（実寸）で表示" : "画面に合わせる"}
            title={zoom.fitted ? "100%（実寸）で表示（ダブルクリックでも）" : "画面に合わせる（⌘0・ダブルクリックでも）"}
            size={15}
            onClick={zoom.toggleActual}
          />
        </span>
        {actions}
      </ViewerHead>
      <div
        ref={zoom.stageRef}
        className={cx("image-viewer-stage", zoom.pannable && "pannable", zoom.dragging && "dragging")}
        {...zoom.stageProps}
        // 画像の外を押すと閉じる（ドラッグで動かしたあとは閉じない）
        onClick={(e) => e.target === e.currentTarget && !zoom.justDragged() && onClose()}
      >
        <img src={image.src} alt={image.name} {...zoom.imageProps} />
      </div>
    </>
  );
}
