import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../cx";
import { CloseButton } from "../IconButton";
import { InlineName } from "../InlineName";

/**
 * パネルのタブ 1 つ（右のパネル・下のパネルで共通）。名前を押すと表示し、× で閉じる。
 * onRename があれば名前のダブルクリックで名前を変え始め、editor がある間は名前の代わりに入力欄を出す（チャットのタブ）。
 * extra は右のパネルで足す属性（ドラッグ・右クリックのメニュー）、className はドラッグで落とす位置の印など
 */
export function PanelTab({
  active,
  icon: Icon,
  iconClass,
  label,
  group,
  title,
  className,
  extra,
  onSelect,
  onClose,
  onRename,
  editor,
  lead,
}: {
  active: boolean;
  icon: LucideIcon;
  iconClass?: string;
  label: string;
  /** チャットのグループ名（名前の後ろに控えめに添える。グループなしなら出さない） */
  group?: string;
  /** 名前にマウスを乗せたときの説明（なければ名前） */
  title?: string;
  className?: string;
  extra?: HTMLAttributes<HTMLDivElement>;
  onSelect: () => void;
  onClose: () => void;
  /** アイコンの代わりに名前の前に置くもの（チャットのタブの状態の印） */
  lead?: ReactNode;
  /** 名前のダブルクリックで名前を変え始める */
  onRename?: () => void;
  /** 名前を変えている途中なら、入力欄の初めの値・上限・決定・取り消し */
  editor?: { initial: string; maxLength: number; onSubmit: (name: string) => void; onCancel: () => void };
}) {
  return (
    <div className={cx("panel-tab", active && "active", className)} role="tab" aria-selected={active} {...extra}>
      {editor ? (
        <span className="panel-tab-label editing">
          {lead ?? <Icon size={12} className={iconClass} aria-hidden />}
          <InlineName initial={editor.initial} maxLength={editor.maxLength} className="panel-tab-input" onSubmit={editor.onSubmit} onCancel={editor.onCancel} />
        </span>
      ) : (
        <button className="panel-tab-label" onClick={onSelect} onDoubleClick={onRename} title={onRename ? `${title ?? label}（ダブルクリックで名前を変更）` : (title ?? label)}>
          {lead ?? <Icon size={12} className={iconClass} aria-hidden />}
          <span>{label}</span>
          {group && <span className="panel-tab-group">{group}</span>}
        </button>
      )}
      {/* 名前を変えている間は、入力欄の ✓ / ✕ と並ばないよう閉じるを隠す */}
      {!editor && (
        <CloseButton label={`${label} のタブを閉じる`} size={12} className="panel-tab-close" onClick={onClose} />
      )}
    </div>
  );
}
