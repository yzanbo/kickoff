// 設定の「ゴミ箱と整理」のゴミ箱のプロジェクトの欄（プロジェクトの行も trash の行の部品で描く）
import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { EmptyTrashButton, TrashRow, useTrashedProjects } from "@/features/trash/ui";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { useTicker } from "@/foundation/ui/hooks/useTicker";

/** ゴミ箱のプロジェクト（プロジェクトの「ゴミ箱」タブには出せないので、設定の「ゴミ箱と整理」から戻す） */
export function TrashedProjects() {
  const { data, error } = useTrashedProjects();
  useTicker(60_000);
  const items = data ?? [];
  return (
    <section className="section">
      <h2>ゴミ箱のプロジェクト</h2>
      <p className="muted small">{`削除したプロジェクトは、チャット・DB の接続・定型文・設定ごと ${TRASH_KEEP_DAYS} 日取っておき、ここから戻せます。${TRASH_KEEP_DAYS} 日たつと本当に消えます（待たずに完全に消すこともできます。プロジェクトのフォルダはどちらでも消えません）。`}</p>
      <EmptyTrashButton items={items} label="すべて完全に消す" title={`ゴミ箱のプロジェクト ${items.length} 件を完全に消しますか？`} />
      <ErrorText message={error} />
      {items.length === 0 ? (
        <p className="muted small">ゴミ箱にプロジェクトはありません。</p>
      ) : (
        <ul className="trash-list">
          {items.map((item) => (
            <TrashRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
