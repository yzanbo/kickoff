import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { useFold } from "@/hooks/useFold";
import { FoldSection } from "@/ui/FoldHead";

/** 未アーカイブとアーカイブ済みに分ける（並びはそのまま） */
export function splitArchived<T extends Pick<Chat, "archived_at">>(list: readonly T[]): [T[], T[]] {
  return [list.filter((chat) => !chat.archived_at), list.filter((chat) => chat.archived_at)];
}

/**
 * ボードの列・まとまりのいちばん下に置く、アーカイブ済みのチャット（サイドバーと同じ見出し。初めは閉じていて、押すと開く）。
 * 開いているかは、ボード（place）と列・段のまとまりのキー（foldKey）で覚える。中のカードは薄く出す（.archived）
 */
export function ArchivedFold({ place, foldKey, count, children }: { place: string; foldKey: string; count: number; children: ReactNode }) {
  const fold = useFold(place, foldKey, { defaultOpen: false });
  if (count === 0) return null;
  return (
    <FoldSection look="row" icon={Archive} label="アーカイブ済み" count={count} open={fold.open} onToggle={fold.toggle} indent={false}>
      <div className="archived-fold">{children}</div>
    </FoldSection>
  );
}
