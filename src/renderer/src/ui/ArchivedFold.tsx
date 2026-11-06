import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { useFold } from "@/hooks/useFold";
import { FoldSection } from "./FoldHead";

/** 未アーカイブとアーカイブ済みに分ける（並びはそのまま） */
export function splitArchived<T extends Pick<Chat, "archived_at">>(list: readonly T[]): [T[], T[]] {
  return [list.filter((chat) => !chat.archived_at), list.filter((chat) => chat.archived_at)];
}

/**
 * 一覧のいちばん下に置く、閉じたまとまり「アーカイブ済み n」（サイドバーのプロジェクトのアーカイブ済みと同じ見出し。初めは閉じていて、押すと開く）。
 * ボードの列・まとまり、サイドバーの子チャット、入力欄の上のサブエージェント・子チャットの一覧で共通。
 * 開いているかは、場所（place）とまとまりのキー（foldKey）で覚える。中の行・カードは使う側で薄く出す（.archived）。件数が 0 なら出さない。
 * indent: 中身を段下げして縦の線でつなぐ（サイドバー）、bodyClassName: 中身を包む要素のクラス（ボードのカードの間隔 archived-fold）
 */
export function ArchivedFold({
  place,
  foldKey,
  count,
  indent = false,
  className,
  bodyClassName,
  children,
}: {
  place: string;
  foldKey: string;
  count: number;
  indent?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const fold = useFold(place, foldKey, { defaultOpen: false });
  if (count === 0) return null;
  return (
    <FoldSection look="row" icon={Archive} label="アーカイブ済み" count={count} open={fold.open} onToggle={fold.toggle} indent={indent} wrapClassName={className}>
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </FoldSection>
  );
}
