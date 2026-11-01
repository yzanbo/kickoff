import { useModalDialog } from "../hooks/useModalDialog";
import { CloseButton } from "./IconButton";

/**
 * 画像を大きく見る（アプリの中で開く。外のブラウザには Kickoff のログインがないので開けない）。
 * Esc・✕・画像の外を押すと閉じる
 */
export function ImageViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const dialog = useModalDialog();
  return (
    <dialog ref={dialog.ref} className="image-viewer" aria-label={name} onClose={onClose} {...dialog.backdropProps}>
      <div className="image-viewer-head">
        <span className="image-viewer-name">{name}</span>
        <CloseButton title="閉じる（Esc）" size={16} onClick={dialog.close} />
      </div>
      <img src={src} alt={name} />
    </dialog>
  );
}
