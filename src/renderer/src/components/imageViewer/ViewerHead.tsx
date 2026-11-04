import type { ReactNode } from "react";
import { CloseButton } from "../IconButton";

/** 画像を大きく見るときの見出し（名前・操作のまとまり・閉じる。まとまりの間は区切り線） */
export function ViewerHead({ name, children, onClose }: { name: string; children?: ReactNode; onClose: () => void }) {
  return (
    <div className="image-viewer-head">
      <span className="image-viewer-name" title={name}>
        {name}
      </span>
      {children}
      <span className="image-viewer-close">
        <CloseButton title="閉じる（Esc）" size={16} onClick={onClose} />
      </span>
    </div>
  );
}
