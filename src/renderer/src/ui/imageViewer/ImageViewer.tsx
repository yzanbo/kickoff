import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode, type SyntheticEvent } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { IconButton } from "@/ui/IconButton";
import { ImageView, type ViewerImage } from "./ImageView";
import { ViewerHead } from "./ViewerHead";

export type { ViewerImage };

/** 中の操作を、開いた元（送信待ちの行のダブルクリックで書き直す・発言の右クリックのメニューなど）に伝えない */
const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * 画像を大きく見る（アプリの中で開く。外のブラウザには Kickoff のログインがないので開けない）。
 * Esc・✕・画像の外を押すと閉じる。画像は拡大・縮小・ドラッグで動かせる（ImageView）。
 * 1 枚なら src と name、何枚もあるなら images と最初の位置 index を渡す（← / → とボタンで前後へ移り、「2 / 3」と出す）。
 * children を渡すと、画像の代わりにそれを出す（Mermaid の図など。拡大・縮小は呼ぶ側が actions で持つ）
 */
export function ImageViewer({
  src,
  name = "",
  images,
  index = 0,
  onClose,
  actions,
  children,
}: {
  src?: string;
  name?: string;
  /** 前後に移って見る画像の一覧（同じ発言・送信待ちの行の画像） */
  images?: ViewerImage[];
  /** images の中で最初に出す位置 */
  index?: number;
  onClose: () => void;
  /** 見出しの、閉じるボタンの手前に置くボタン（拡大・縮小など） */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  // 開いた直後はダイアログ自体にピントを置く（最初のボタンにピントの枠が出て、そこだけずれて見えないように）
  const dialog = useModalDialog({ focusSelf: true });
  const list = children !== undefined ? [] : (images ?? (src ? [{ src, name }] : []));
  const [current, setCurrent] = useState(() => Math.min(Math.max(0, index), Math.max(0, list.length - 1)));
  const image = list[current];
  const many = list.length > 1;
  const go = (step: number) => setCurrent((i) => Math.min(list.length - 1, Math.max(0, i + step)));

  useWindowEvent(
    "keydown",
    (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    many,
    true,
  );

  return (
    <dialog
      ref={dialog.ref}
      className="image-viewer"
      tabIndex={-1}
      aria-label={image?.name ?? name}
      onClose={onClose}
      {...dialog.backdropProps}
      onDoubleClick={stop}
      onContextMenu={stop}
    >
      {image ? (
        <ImageView
          // 前後へ移るたびに作り直し、「画面に合わせる」に戻す
          key={`${current}:${image.src}`}
          image={image}
          onClose={dialog.close}
          actions={actions}
          nav={
            many && (
              <span className="image-viewer-tools">
                <IconButton icon={ChevronLeft} label="前の画像" title="前の画像（←）" size={16} disabled={current === 0} onClick={() => go(-1)} />
                <span className="image-viewer-count" aria-label={`${list.length} 枚中 ${current + 1} 枚目`}>
                  {current + 1} / {list.length}
                </span>
                <IconButton
                  icon={ChevronRight}
                  label="次の画像"
                  title="次の画像（→）"
                  size={16}
                  disabled={current === list.length - 1}
                  onClick={() => go(1)}
                />
              </span>
            )
          }
        />
      ) : (
        <>
          <ViewerHead name={name} onClose={dialog.close}>
            {actions}
          </ViewerHead>
          {children}
        </>
      )}
    </dialog>
  );
}
