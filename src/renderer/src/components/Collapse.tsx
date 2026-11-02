import { useEffect, useState, type ReactNode } from "react";
import { cx } from "../cx";

/**
 * 開閉で高さがなめらかに変わる入れ物（サイドバーのプロジェクト・グループ・まとまりの開閉）。
 * 閉じる動きのあいだは中身を残し、閉じきったら外す。indent: 中身を段下げして縦の線でつなぐ（どこに入っているかが分かるように）
 */
export function Collapse({ open, indent = false, children }: { open: boolean; indent?: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  useEffect(() => {
    if (!open) {
      setExpanded(false);
      // 動きを減らす設定のときは、動きの終わりの知らせが来ないので、すぐ外す
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) setMounted(false);
      return;
    }
    setMounted(true);
    // 閉じた高さで一度描いてから開く（そうしないと動かない）
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setExpanded(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open]);
  if (!mounted) return null;
  return (
    <div
      className={cx("collapse", expanded && "open", indent && "indent")}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !open) setMounted(false);
      }}
    >
      <div className="collapse-inner">{children}</div>
    </div>
  );
}
