import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import type { Run } from "@shared/types";
import { useStoredFlag } from "@/hooks/useStoredState";
import { boardArchivedOpenKey } from "@/lib/storageKeys";
import { RowSection } from "@/ui/RowSection";

/** 未アーカイブとアーカイブ済みに分ける（並びはそのまま） */
export function splitArchived<T>(list: T[], runOf: (item: T) => Pick<Run, "archived_at">): [T[], T[]] {
  return [list.filter((item) => !runOf(item).archived_at), list.filter((item) => runOf(item).archived_at)];
}

/**
 * ボードの列・まとまりのいちばん下に置く、アーカイブ済みのチャット（サイドバーと同じ見出し。初めは閉じていて、押すと開く）。
 * 開いているかは、ボード・段・列ごとに覚える（foldKey）。中のカードは薄く出す（.archived）
 */
export function ArchivedFold({ foldKey, count, children }: { foldKey: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useStoredFlag(boardArchivedOpenKey(foldKey));
  if (count === 0) return null;
  return (
    <RowSection icon={Archive} label="アーカイブ済み" count={count} open={open} onToggle={() => setOpen(!open)} indent={false}>
      <div className="archived-fold">{children}</div>
    </RowSection>
  );
}
