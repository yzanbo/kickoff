import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { useTicker } from "@/foundation/ui/hooks/useTicker";
import { EmptyTrashButton, TrashRow, useProjectTrash } from "@/features/trash/ui";
import { useProjects } from "@/features/projects/ui";
import { COMMON_NOTES_LABEL, useCommonNotes } from "@/features/notes/ui/commonNotes";

/**
 * 設定の「ゴミ箱と整理」の共通のノートのゴミ箱（見えないプロジェクトのゴミ箱。そのプロジェクトの「ゴミ箱」タブはないので、ここと全ノートの画面の
 * 「共通のノート」の欄の「…」から戻す）。あるときだけ出す
 */
export function CommonNotesTrash() {
  const common = useCommonNotes();
  const ready = common.state === "ready";
  const { data } = useProjectTrash(ready ? common.projectId : 0, ready);
  // 元の場所を共通のノートのフォルダからの場所で出す（共通の本体は作業フォルダなので、ノートのフォルダ note_dir を使う）
  const dir = useProjects().projectsById.get(ready ? common.projectId : 0)?.note_dir ?? undefined;
  useTicker(60_000);
  if (!ready || !data?.length) return null;
  return (
    <section className="section">
      <h2>ゴミ箱（{COMMON_NOTES_LABEL}）</h2>
      <p className="muted small">{`共通のノートで消したものです。${TRASH_KEEP_DAYS} 日たつと本当に消えます（待たずに完全に消すこともできます）。全ノートの画面の「共通のノート」の欄の「…」からも開けます。`}</p>
      <EmptyTrashButton items={data} label="すべて完全に消す" title={`共通のノートのゴミ箱の ${data.length} 件を完全に消しますか？`} />
      <ul className="trash-list">
        {data.map((item) => (
          <TrashRow key={item.id} item={item} repoPath={dir} />
        ))}
      </ul>
    </section>
  );
}
