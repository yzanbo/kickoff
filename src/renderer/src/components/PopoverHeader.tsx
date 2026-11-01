import type { ReactNode } from "react";
import { CloseButton, RefreshButton } from "./IconButton";

/** ポップオーバーの見出し（題名・取り直し・閉じる） */
export function PopoverHeader({
  title,
  refresh,
  onClose,
}: {
  title: ReactNode;
  /** 取り直しのボタン（label は読み上げ、title はマウスを乗せたときの説明） */
  refresh?: { label: string; title: string; busy: boolean; onClick: () => void };
  onClose: () => void;
}) {
  return (
    <div className="popover-head">
      <span className="popover-title">{title}</span>
      {refresh && <RefreshButton label={refresh.label} title={refresh.title} size={13} busy={refresh.busy} onClick={refresh.onClick} />}
      <CloseButton title="閉じる（Esc）" onClick={onClose} />
    </div>
  );
}
