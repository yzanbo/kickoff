import type { ReactNode } from "react";
import { CloseButton } from "../IconButton";

/** 画像を大きく見るときの見出し（名前・操作・閉じる） */
export function ViewerHead({ name, children, onClose }: { name: string; children?: ReactNode; onClose: () => void }) {
  return (
    <div className="image-viewer-head">
      <span className="image-viewer-name" title={name}>
        {name}
      </span>
      {children}
      <CloseButton title="閉じる（Esc）" size={16} onClick={onClose} />
    </div>
  );
}
