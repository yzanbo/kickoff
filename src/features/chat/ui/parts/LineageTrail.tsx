import { Fragment, type ReactNode } from "react";

/** 帯の 1 段（親チャットの札・サブエージェントの名前など） */
export interface LineageItem {
  key: string | number;
  node: ReactNode;
}

/**
 * 階層の帯（子チャットの上の帯の系譜・右の欄のサブエージェントの画面の階層。根 › … › 親 の順）。区切り sep を段の間に入れる（trailing なら段の後ろごとに）。
 * max を超える深さは、根と終わりの max - 1 段のあいだを「…」にまとめる。upClassName を渡すと、最後の段より前（根の側）を区切りごとその class で包む
 * （狭い帯で根の側を隠すため）
 */
export function LineageTrail({
  className,
  label,
  lead,
  items,
  sep,
  trailing = false,
  max,
  upClassName,
}: {
  className: string;
  label: string;
  /** 帯の頭に置くもの（「親」の印など） */
  lead?: ReactNode;
  items: readonly LineageItem[];
  sep: ReactNode;
  trailing?: boolean;
  max?: number;
  upClassName?: string;
}) {
  const shown: LineageItem[] =
    max !== undefined && items.length > max ? [items[0], { key: "more", node: <span className="muted">…</span> }, ...items.slice(-(max - 1))] : [...items];
  return (
    <nav className={className} aria-label={label}>
      {lead}
      {shown.map((item, i) => {
        const before = !trailing && i > 0 ? sep : null;
        const after = trailing ? sep : null;
        return upClassName && i < shown.length - 1 ? (
          <span key={item.key} className={upClassName}>
            {before}
            {item.node}
            {after}
          </span>
        ) : (
          <Fragment key={item.key}>
            {before}
            {item.node}
            {after}
          </Fragment>
        );
      })}
    </nav>
  );
}
