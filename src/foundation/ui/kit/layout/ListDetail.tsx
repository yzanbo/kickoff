import type { ReactNode } from "react";
import { ListRail } from "@/foundation/ui/kit/ListRail";
import { cx } from "@/foundation/ui/lib/cx";
import type { ListDetailState } from "./useListDetail";

/**
 * 一覧＋詳細の 2 欄を描く（状態は useListDetail）。一覧の右端に幅を変えるつまみ（広いときだけ）、一覧を隠している間は ListRail。
 * 狭いときは根に narrow のクラスを付ける。listLabel は ListRail のボタンの名前（「〇〇の一覧を表示」）
 */
export function ListDetail({
  state,
  list,
  detail,
  className,
  listClassName,
  detailClassName,
  listLabel,
}: {
  state: ListDetailState;
  list: ReactNode;
  detail: ReactNode;
  className?: string;
  listClassName?: string;
  detailClassName?: string;
  listLabel: string;
}) {
  const { rootRef, listRef, narrow, showList, showDetail, showRail, listStyle, handleProps, show } = state;
  return (
    <div ref={rootRef} className={cx("list-detail", className, narrow && "narrow")}>
      {showList && (
        <aside ref={listRef} className={cx("list-detail-list", listClassName)} style={listStyle}>
          {list}
          {!narrow && <div className="pane-resizer list-detail-resizer" {...handleProps} />}
        </aside>
      )}
      {showRail && <ListRail label={listLabel} onShow={show} />}
      {showDetail && <div className={cx("list-detail-detail", detailClassName)}>{detail}</div>}
    </div>
  );
}
