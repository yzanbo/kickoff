import type { ReactNode } from "react";
import { useModalDialog } from "../hooks/useModalDialog";
import { CloseButton } from "./IconButton";

/**
 * 画像を大きく見る（アプリの中で開く。外のブラウザには Kickoff のログインがないので開けない）。
 * Esc・✕・画像の外を押すと閉じる。children を渡すと、画像の代わりにそれを出す（Mermaid の図など）
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
    <dialog ref={dialog.ref} className="image-viewer" aria-label={name} onClose={onClose} {...dialog.backdropProps}>
      <div className="image-viewer-head">
        <span className="image-viewer-name">{name}</span>
        {actions}
        <CloseButton title="閉じる（Esc）" size={16} onClick={dialog.close} />
      </div>
      {children ?? <img src={src} alt={name} />}
    </dialog>
  );
}
