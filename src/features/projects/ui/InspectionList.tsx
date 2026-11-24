import type { ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";

/** 点検の行の種類（✓ よい・⚠ 気をつける・✕ できない・ℹ 知らせ） */
export type InspectionKind = "ok" | "warn" | "ng" | "info";

const ICONS: Record<InspectionKind, string> = { ok: "✓", warn: "⚠", ng: "✕", info: "ℹ" };

/** 点検・被りの知らせの一覧（取り込むフォルダの点検・フォルダの被り。行がなければ何も出さない） */
export function InspectionList({ items, className }: { items: readonly { kind: InspectionKind; text: ReactNode }[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cx("inspection", className)}>
      {items.map((item, i) => (
        <li key={i} className={`inspection-${item.kind}`}>
          <span className="inspection-icon" aria-hidden>
            {ICONS[item.kind]}
          </span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
