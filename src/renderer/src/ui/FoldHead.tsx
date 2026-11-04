import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Collapse } from "./Collapse";
import { GroupToggle } from "./GroupToggle";

/**
 * 見出しの見た目（クラスの組）。row = サイドバーの控えめなまとまり（固定・アーカイブ済み・グループなし・しまったプロジェクト）/
 * group = 自分で作ったグループ / section = 並べ方のまとまり（状態・作業場所）/ lane = ボードの段。
 * wrap は FoldSection の入れ物。件数は、row・group では名前の後ろ、section・lane では名前のボタンの中
 */
const LOOKS = {
  row: { wrap: "row-section", head: "custom-group-head ungrouped", name: "custom-group-name ungrouped-name", count: "custom-group-count", countInName: false },
  group: { wrap: "custom-group", head: "custom-group-head", name: "custom-group-name", count: "custom-group-count", countInName: false },
  section: { wrap: "status-group", head: "status-group-head", name: "status-group-name", count: "status-group-count", countInName: true },
  lane: { wrap: "board-lane", head: "board-lane-head", name: "board-lane-name", count: "board-lane-count", countInName: true },
} as const;

type FoldLook = keyof typeof LOOKS;

export interface FoldHeadProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  look: FoldLook;
  open: boolean;
  onToggle: () => void;
  /** 開閉の矢印の横に添えるアイコン（フォルダ・固定・アーカイブ） */
  icon?: LucideIcon;
  iconSize?: number;
  /** 名前（印・添え書きを含めてよい。押すと開閉する） */
  label?: ReactNode;
  /** 件数（省けば出さない） */
  count?: number;
  /** 名前のボタンの代わりに置くもの（自分で作ったグループの、押すと選ぶ名前・名前の入力欄） */
  name?: ReactNode;
  /** 右に並べる操作（＋・「…」など） */
  actions?: ReactNode;
}

/**
 * 開閉できるまとまりの見出しの土台（サイドバーのまとまり・グループ・並べ方のまとまり、ボードの段で共通）: 開閉の矢印（GroupToggle）・
 * 名前（押しても開閉）・件数・右の操作。見た目は look で選ぶ。ほかの props（ドロップ先・ドラッグ・右クリック・title など）は見出しの要素に付ける。
 * 開閉の記憶は hooks/useFold
 */
export function FoldHead({ look, open, onToggle, icon, iconSize = look === "row" ? 12 : undefined, label, count, name, actions, className, ...rest }: FoldHeadProps) {
  const l = LOOKS[look];
  const countText = count !== undefined && <span className={l.count}>{count}</span>;
  return (
    <div className={cx(l.head, className)} {...rest}>
      <GroupToggle open={open} onToggle={onToggle} icon={icon} iconSize={iconSize} />
      {name ?? (
        <button type="button" className={l.name} aria-expanded={open} onClick={onToggle}>
          {label}
          {l.countInName && countText}
        </button>
      )}
      {!l.countInName && countText}
      {actions}
    </div>
  );
}

/**
 * 見出しと、開閉で高さがなめらかに変わる中身（Collapse）の組（サイドバーの固定・アーカイブ済み・並べ方のまとまり、ボードの列のアーカイブ済み）。
 * indent: 中身を段下げして縦の線でつなぐ（ボードのカードには付けない）。wrapClassName はまとまりの種類の見た目（pinned: ピンを固定の色で塗る）
 */
export function FoldSection({ indent = true, wrapClassName, children, ...head }: FoldHeadProps & { indent?: boolean; wrapClassName?: string; children: ReactNode }) {
  return (
    <div className={cx(LOOKS[head.look].wrap, wrapClassName)}>
      <FoldHead {...head} />
      <Collapse open={head.open} indent={indent}>
        {children}
      </Collapse>
    </div>
  );
}
