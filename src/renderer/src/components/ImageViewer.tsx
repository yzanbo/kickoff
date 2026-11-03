import type { ReactNode } from "react";
import { useModalDialog } from "../hooks/useModalDialog";
import { ImageView } from "./imageViewer/ImageView";
import { ViewerHead } from "./imageViewer/ViewerHead";

/**
 * 画像を大きく見る（アプリの中で開く。外のブラウザには Kickoff のログインがないので開けない）。
 * Esc・✕・画像の外を押すと閉じる。画像は拡大・縮小・ドラッグで動かせる（ImageView）。
 * children を渡すと、画像の代わりにそれを出す（Mermaid の図など。拡大・縮小は呼ぶ側が actions で持つ）
 */
export function ImageViewer({
  src,
  name,
  onClose,
  actions,
  children,
}: {
  src?: string;
  name: string;
  onClose: () => void;
  /** 見出しの、閉じるボタンの手前に置くボタン（拡大・縮小など） */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const dialog = useModalDialog();
  return (
    <dialog
      ref={dialog.ref}
      className="image-viewer"
      aria-label={name}
      onClose={onClose}
      {...dialog.backdropProps}
      // 中のダブルクリックを、開いた元の行（送信待ちの行の書き直しなど）に伝えない
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children === undefined && src ? (
        <ImageView image={{ src, name }} onClose={dialog.close} actions={actions} />
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
