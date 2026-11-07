import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useModalDialog } from "@/hooks/useModalDialog";
import { CloseButton } from "./IconButton";

export interface DialogSection<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
  /** 削除など。一覧のいちばん下に置き、選ぶと赤くする */
  danger?: boolean;
}

/**
 * 左に項目の一覧、右に選んだ項目の内容を出すダイアログ（アプリの設定・プロジェクトの編集）。
 * 画面は移らない。Esc・✕・背景で閉じる
 */
export function TabbedDialog<K extends string>({
  title,
  sections,
  initial,
  onClose,
  children,
}: {
  title: string;
  sections: DialogSection<K>[];
  /** 最初に開く項目（省略時は先頭） */
  initial?: K;
  onClose: () => void;
  /** 選んでいる項目の内容（select で中からほかの項目へ移れる） */
  children: (section: K, select: (section: K) => void) => ReactNode;
}) {
  // 開いた直後に ✕ ボタンへピントが当たって枠が出ないよう、ダイアログ自体にピントを置く
  const dialog = useModalDialog({ focusSelf: true });
  const [section, setSection] = useState<K>(initial ?? sections[0].key);
  return (
    <dialog ref={dialog.ref} className="dialog tabbed-dialog" tabIndex={-1} onClose={onClose} {...dialog.backdropProps}>
      <header className="tabbed-dialog-head">
        <h2>{title}</h2>
        <CloseButton title="閉じる（Esc）" size={16} onClick={dialog.close} />
      </header>
      <div className="tabbed-dialog-body">
        <nav className="tabbed-dialog-nav" aria-label="設定の項目">
          {sections.map(({ key, label, icon: Icon, danger }) => (
            <button
              key={key}
              className={cx("tabbed-dialog-tab", section === key && "active", danger && "danger")}
              aria-current={section === key}
              onClick={() => setSection(key)}
            >
              <Icon size={15} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <div className="tabbed-dialog-content">{children(section, setSection)}</div>
      </div>
    </dialog>
  );
}
