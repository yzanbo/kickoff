import type { ReactNode } from "react";
import { ArchivedFold, splitArchived } from "@/foundation/ui/kit/ArchivedFold";
import { ProgressiveItems } from "@/foundation/ui/kit/ProgressiveRows";

/**
 * アーカイブしていないもの → いちばん下の閉じたまとまり「アーカイブ済み n」（ボードの列・グループの列・分けない並び・フィードで 1 つ）。
 * 並びはそのまま分け、どちらも最初は画面に入る数だけ描く（ProgressiveItems）。
 * - lead: 先頭に置くもの（下書きのカード。leadCount はその数）
 * - empty: アーカイブしていないもの（wrap があるときは lead も）がないときに出す文
 * - wrap: アーカイブしていないものと lead を包む要素のクラス（中身がなければ包まず empty だけ）
 * - inner: アーカイブしていないものの代わりに描くもの（グループの中を状態ごとに分けるとき）
 * - fold: アーカイブ済みを畳んで出すか（foldPlace・foldKey で開閉を覚える。foldClass は中を包むクラス）
 */
export function ArchivableItems<T extends { archived_at: string | null }>({
  items,
  render,
  lead,
  leadCount = 0,
  empty,
  wrap,
  inner,
  fold = true,
  foldPlace,
  foldKey,
  foldClass = "archived-fold",
}: {
  items: readonly T[];
  render: (item: T) => ReactNode;
  lead?: ReactNode;
  leadCount?: number;
  empty?: ReactNode;
  wrap?: string;
  inner?: ReactNode;
  fold?: boolean;
  foldPlace?: string;
  foldKey: string;
  foldClass?: string;
}) {
  const [active, archived] = splitArchived(items);
  const list = inner ?? <ProgressiveItems items={active} render={render} />;
  return (
    <>
      {wrap === undefined ? (
        <>
          {lead}
          {active.length === 0 && empty}
          {list}
        </>
      ) : leadCount === 0 && active.length === 0 ? (
        empty
      ) : (
        <div className={wrap}>
          {lead}
          {list}
        </div>
      )}
      {fold && foldPlace && (
        <ArchivedFold place={foldPlace} foldKey={foldKey} count={archived.length} bodyClassName={foldClass}>
          <ProgressiveItems items={archived} render={render} />
        </ArchivedFold>
      )}
    </>
  );
}

/** ボードの列の中身の入れ物（リストの表示ではカードの囲いを付けない） */
export function ColumnBody({ list, children }: { list: boolean; children: ReactNode }) {
  return list ? children : <div className="column-cards">{children}</div>;
}

/** アーカイブしていないもの（数え方・見出しの数。並びはそのまま） */
export const activeOf = <T extends { archived_at: string | null }>(items: readonly T[]): T[] => splitArchived(items)[0];
/** アーカイブ済みのもの（並びはそのまま） */
export const archivedOf = <T extends { archived_at: string | null }>(items: readonly T[]): T[] => splitArchived(items)[1];
