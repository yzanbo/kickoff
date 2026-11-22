import type { ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useRovingList } from "./list/useRovingList";

/** ピル 1 つ */
export interface Pill<K> {
  key: K;
  label: ReactNode;
  title?: string;
  /** そのピルだけに足す class（アーカイブ済みなど） */
  className?: string;
}

/** 押したあとの選び（single は押したものだけ、multi は付け外し。keepOne なら最後の 1 つは外さない。変わらなければ null） */
export function nextPills<K>(selected: readonly K[], key: K, mode: "single" | "multi", keepOne = false): K[] | null {
  if (mode === "single") return selected.length === 1 && selected[0] === key ? null : [key];
  if (!selected.includes(key)) return [...selected, key];
  if (keepOne && selected.length === 1) return null;
  return selected.filter((k) => k !== key);
}

/**
 * ピルの行（絞り込みの対象・状態など）。mode が single なら 1 つを選び（radio）、multi なら付け外す（aria-pressed）。
 * ←→ でピルを移る（Tab はどのピルにも止まる）。見た目は className（行）と pillClassName（ピル。選んだものに active）で決める
 */
export function PillGroup<K extends string | number>({
  pills,
  selected,
  mode,
  keepOne,
  label,
  className,
  pillClassName,
  onChange,
}: {
  pills: readonly Pill<K>[];
  selected: readonly K[];
  mode: "single" | "multi";
  keepOne?: boolean;
  label: string;
  className?: string;
  pillClassName: string;
  onChange: (next: K[]) => void;
}) {
  const nav = useRovingList({ mode: "focus", orientation: "horizontal" });
  return (
    <div className={className} role={mode === "single" ? "radiogroup" : "group"} aria-label={label} onKeyDown={nav.onKeyDown}>
      {pills.map((pill) => {
        const on = selected.includes(pill.key);
        return (
          <button
            key={pill.key}
            type="button"
            className={cx(pillClassName, on && "active", pill.className)}
            {...(mode === "single" ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })}
            title={pill.title}
            onClick={() => {
              const next = nextPills(selected, pill.key, mode, keepOne);
              if (next) onChange(next);
            }}
          >
            {pill.label}
          </button>
        );
      })}
    </div>
  );
}
