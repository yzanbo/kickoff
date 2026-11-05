import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { CloseButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";

/**
 * パネルのタブ 1 つ（右のパネル・下のパネルで共通）。タブのどこを押しても表示し（名前のボタンの押せる範囲を CSS でタブ全体に広げる）、× で閉じる。
 * onRename があれば名前のダブルクリックで名前を変え始め、editor がある間は名前の代わりに入力欄を出す（チャットのタブ）。
 * extra は右のパネルで足す属性（ドラッグ・右クリックのメニュー）、className はドラッグで落とす位置の印など
 */
export function PanelTab({
  active,
  icon: Icon,
  iconClass,
  badge,
  label,
  group,
  title,
  className,
  extra,
  onSelect,
  onClose,
  closeLabel,
  onRename,
  editor,
  lead,
}: {
  active: boolean;
  icon: LucideIcon;
  iconClass?: string;
  /** 名前の前に置く種類の札（メモ・サブ・子）。タブの枠もその種類の色にする（kind で色を分ける。CSS の .tab-kind-<kind>） */
  badge?: { text: string; kind: string };
  label: string;
  /** チャットのグループ名（名前の後ろに控えめに添える。グループなしなら出さない） */
  group?: string;
  /** 名前にマウスを乗せたときの説明（なければ名前） */
  title?: string;
  className?: string;
  extra?: HTMLAttributes<HTMLDivElement>;
  onSelect: () => void;
  onClose: () => void;
  /** 閉じるボタンの名前（なければ「〜 のタブを閉じる」。分けたペインのチャットは「一覧のペインに戻す」） */
  closeLabel?: string;
  /** アイコンの代わりに名前の前に置くもの（チャットのタブの状態の印） */
  lead?: ReactNode;
  /** 名前のダブルクリックで名前を変え始める */
  onRename?: () => void;
  /** 名前を変えている途中なら、入力欄の初めの値・上限・決定・取り消し */
  editor?: { initial: string; maxLength: number; onSubmit: (name: string) => void; onCancel: () => void };
}) {
  return (
    <div className={cx("panel-tab", active && "active", badge && `panel-tab-typed tab-kind-${badge.kind}`, className)} role="tab" aria-selected={active} {...extra}>
      {editor ? (
        <span className="panel-tab-label editing">
          {lead ?? <Icon size={12} className={iconClass} aria-hidden />}
          <InlineName initial={editor.initial} maxLength={editor.maxLength} className="panel-tab-input" onSubmit={editor.onSubmit} onCancel={editor.onCancel} />
        </span>
      ) : (
        <button className="panel-tab-label" onClick={onSelect} onDoubleClick={onRename} title={onRename ? `${title ?? label}（ダブルクリックで名前を変更）` : (title ?? label)}>
          {lead ?? <Icon size={12} className={iconClass} aria-hidden />}
          {badge && <span className="panel-tab-kind">{badge.text}</span>}
          <span>{label}</span>
          {group && <span className="panel-tab-group-name">{group}</span>}
        </button>
      )}
      {/* 名前を変えている間は、入力欄の ✓ / ✕ と並ばないよう閉じるを隠す */}
      {!editor && (
        <CloseButton label={closeLabel ?? `${label} のタブを閉じる`} size={12} className="panel-tab-close" onClick={onClose} />
      )}
    </div>
  );
}
