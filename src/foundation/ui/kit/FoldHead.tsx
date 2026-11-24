import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { Collapse } from "./Collapse";
import { FoldToggle } from "@/foundation/ui/kit/layout/FoldToggle";

/** 見出しの見た目（クラスの組・件数の置き場所）。控えめなまとまりは FOLD_ROW、ほかの組は持ち主の機能が持つ（サイドバーのグループ・ボードの段） */
export interface FoldLook {
  /** FoldSection の入れ物 */
  wrap: string;
  head: string;
  name: string;
  count: string;
  /** 件数を名前のボタンの中に置く（既定は名前の後ろ） */
  countInName?: boolean;
  /** 添えるアイコンの大きさの既定 */
  iconSize?: number;
}

/** 控えめなまとまり（サイドバーの固定・アーカイブ済み・グループなし・しまったプロジェクト、一覧のいちばん下の「アーカイブ済み」・ToDo の残り） */
export const FOLD_ROW: FoldLook = { wrap: "row-section", head: "custom-group-head ungrouped", name: "custom-group-name ungrouped-name", count: "custom-group-count", iconSize: 12 };

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
 * 開閉できるまとまりの見出しの土台: 開閉の矢印（FoldToggle）・
 * 名前（押しても開閉）・件数・右の操作。見た目は look で選ぶ。ほかの props（ドロップ先・ドラッグ・右クリック・title など）は見出しの要素に付ける。
 * 開閉の記憶は hooks/useFold
 */
export function FoldHead({ look: l, open, onToggle, icon, iconSize: givenIconSize, label, count, name, actions, className, ...rest }: FoldHeadProps) {
  const iconSize = givenIconSize ?? l.iconSize;
  const countText = count !== undefined && <span className={l.count}>{count}</span>;
  return (
    <div className={cx(l.head, className)} {...rest}>
      <FoldToggle open={open} onToggle={onToggle} icon={icon} iconSize={iconSize} />
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
    <div className={cx(head.look.wrap, wrapClassName)}>
      <FoldHead {...head} />
      <Collapse open={head.open} indent={indent}>
        {children}
      </Collapse>
    </div>
  );
}
